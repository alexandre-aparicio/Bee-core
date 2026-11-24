import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { installSignedPluginZip } from "../src/core/plugin-zip-installer.js";

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function packageDigest(files: Map<string, Buffer>): string {
  const hash = createHash("sha256");
  for (const [name, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name); hash.update(Buffer.from([0])); hash.update(createHash("sha256").update(data).digest("hex")); hash.update(Buffer.from([10]));
  }
  return hash.digest("hex");
}
function zip(files: Array<{name:string;data:Buffer;mode?:number}>): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x0800,6);header.writeUInt16LE(8,8);
    header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(file.data.length,22);
    header.writeUInt16LE(name.length,26);header.writeUInt16LE(0,28);
    local.push(header,name,compressed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(0x0314,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x0800,8);dir.writeUInt16LE(8,10);
    dir.writeUInt32LE(crc,16);dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(file.data.length,24);
    dir.writeUInt16LE(name.length,28);dir.writeUInt16LE(0,30);dir.writeUInt16LE(0,32);dir.writeUInt16LE(0,34);
    dir.writeUInt32LE(((file.mode??0o100644)<<16)>>>0,38);dir.writeUInt32LE(offset,42);
    central.push(dir,name);
    offset += header.length + name.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,centralBytes,end]);
}
function signedArchive() {
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const files=new Map<string,Buffer>([
    ["dist/backend/index.mjs",Buffer.from("export const plugin = true;")],
    ["README.md",Buffer.from("# Signed plugin package")]
  ]);
  const digest=packageDigest(files);
  const manifest:any={
    id:"demo.crm",name:"Demo CRM",version:"1.0.0",publisher:"Bee Projects",description:"Test package",category:"crm",
    activationPolicy:"manual",compatibility:{minRuntimeVersion:"0.3.0"},
    dependencies:[],permissions:[{key:"demo.crm.read",description:"Read CRM records"}],
    backend:{entrypoint:"dist/backend/index.mjs"},frontend:{routes:[]},collections:["demo_crm_records"],migrations:[],settingsSchema:{type:"object"},
    package:{sha256:digest,signature:"",storageKey:"packages/demo.crm/1.0.0"}
  };
  const payload=Buffer.from(["bee-plugin-package-v1",manifest.id,manifest.version,manifest.publisher,digest].join("\n"));
  manifest.package.signature=sign(null,payload,privateKey).toString("base64");
  const all=new Map(files);all.set("bee-plugin.json",Buffer.from(JSON.stringify(manifest)));
  const archive=zip([...all.entries()].map(([name,data])=>({name,data})));
  return {archive,publicKey:publicKey.export({type:"spki",format:"pem"}).toString(),manifest};
}

test("signed plugin ZIP is verified and atomically extracted into its versioned package directory",async()=>{
  const fixture=signedArchive();const root=await mkdtemp(join(tmpdir(),"bee-plugin-installer-"));
  try{
    const result=await installSignedPluginZip({archive:fixture.archive,storageRoot:root,publisherPublicKey:fixture.publicKey,runtimeVersion:"0.3.1"});
    assert.equal(result.manifest.id,"demo.crm");
    assert.equal(result.runtimeState,undefined);
    assert.equal(result.extractedFiles,3);
    assert.equal(await readFile(join(result.packageDirectory,"dist/backend/index.mjs"),"utf8"),"export const plugin = true;");
    assert.equal(result.storageKey,"packages/demo.crm/1.0.0");
  }finally{await rm(root,{recursive:true,force:true});}
});

test("plugin ZIP rejects path traversal before writing any package files",async()=>{
  const fixture=signedArchive();
  const unsafe=zip([
    {name:"../outside.txt",data:Buffer.from("outside")},
    {name:"README.md",data:Buffer.from("readme")}
  ]);
  const root=await mkdtemp(join(tmpdir(),"bee-plugin-installer-path-"));
  try{
    await assert.rejects(installSignedPluginZip({archive:unsafe,storageRoot:root,publisherPublicKey:fixture.publicKey,runtimeVersion:"0.3.1"}),/unsafe path/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("plugin ZIP rejects publisher signature tampering",async()=>{
  const fixture=signedArchive();const root=await mkdtemp(join(tmpdir(),"bee-plugin-installer-signature-"));
  try{
    await assert.rejects(installSignedPluginZip({archive:fixture.archive,storageRoot:root,publisherPublicKey:generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString(),runtimeVersion:"0.3.1"}),/signature verification failed/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("plugin ZIP rejects symbolic links and unsupported archive entries",async()=>{
  const fixture=signedArchive();const root=await mkdtemp(join(tmpdir(),"bee-plugin-installer-link-"));
  const unsafe=zip([{name:"README.md",data:Buffer.from("link"),mode:0o120777}]);
  try{
    await assert.rejects(installSignedPluginZip({archive:unsafe,storageRoot:root,publisherPublicKey:fixture.publicKey,runtimeVersion:"0.3.1"}),/symbolic links/);
  }finally{await rm(root,{recursive:true,force:true});}
});
