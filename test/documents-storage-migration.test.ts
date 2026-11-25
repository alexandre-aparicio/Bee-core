import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { migrateDocumentsFiles } from "../scripts/migrate-documents-files-to-owned-storage.mjs";

const tenantId = "tenant-migration-a";
const fileId = "11111111-2222-4333-8444-555555555555";
const key = (tenant:string,id:string) => tenant + ":" + id;
const tenantDirectory = (root:string,tenant:string) => path.join(root,createHash("sha256").update(tenant).digest("hex"));

function fakeDb(documents:any[],legacyRows:any[]) {
  const legacy = new Map(legacyRows.map(row=>[key(row.tenantId,row.id),row]));
  const owned = new Map<string,any>();
  const collection = (name:string) => ({
    createIndex: async()=>undefined,
    find: (filter:any={}) => ({
      project: () => ({
        toArray: async()=>documents.filter(row=>!filter.tenantId||row.tenantId===filter.tenantId)
      })
    }),
    findOne: async(query:any) => (name==="tenant_files"?legacy:owned).get(key(query.tenantId,query.id))??null,
    insertOne: async(row:any) => {
      const rowKey=key(row.tenantId,row.id);
      if(owned.has(rowKey))throw Object.assign(new Error("duplicate key"),{code:11000});
      owned.set(rowKey,row);
    }
  });
  return { db:{collection}, legacy, owned };
}

test("legacy Documents file migration is dry-run by default, copies safely and is idempotent",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"bee-documents-migration-"));
  const legacyRoot=path.join(root,"legacy"),documentsRoot=path.join(root,"documents");
  const bytes=Buffer.from("preserve this legacy document");
  const sourceDirectory=tenantDirectory(legacyRoot,tenantId);
  await mkdir(sourceDirectory,{recursive:true});
  await writeFile(path.join(sourceDirectory,fileId),bytes);
  const source={id:fileId,tenantId,storageKey:fileId,originalName:"contract.txt",contentType:"text/plain",size:bytes.length,checksum:createHash("sha256").update(bytes).digest("hex"),uploadedBy:"user-a",createdAt:new Date("2026-01-01T00:00:00Z")};
  const fake=fakeDb([{tenantId,fileId}], [source]);
  try{
    const dry=await migrateDocumentsFiles({db:fake.db,legacyRoot,documentsRoot});
    assert.equal(dry.wouldCopy,1);
    assert.equal(dry.copied,0);
    assert.equal(fake.owned.size,0);

    const applied=await migrateDocumentsFiles({db:fake.db,legacyRoot,documentsRoot,apply:true});
    assert.equal(applied.copied,1);
    assert.equal(applied.issues.length,0);
    assert.deepEqual(await readFile(path.join(tenantDirectory(documentsRoot,tenantId),fileId)),bytes);
    assert.ok(fake.owned.has(key(tenantId,fileId)));
    assert.ok(fake.legacy.has(key(tenantId,fileId)),"source Files metadata must remain untouched");
    assert.deepEqual(await readFile(path.join(sourceDirectory,fileId)),bytes,"source Files binary must remain untouched");

    const repeated=await migrateDocumentsFiles({db:fake.db,legacyRoot,documentsRoot,apply:true});
    assert.equal(repeated.alreadyMigrated,1);
    assert.equal(repeated.copied,0);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("legacy Documents file migration refuses a corrupt source without writing destination data",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"bee-documents-migration-corrupt-"));
  const legacyRoot=path.join(root,"legacy"),documentsRoot=path.join(root,"documents");
  const bytes=Buffer.from("tampered legacy document");
  const sourceDirectory=tenantDirectory(legacyRoot,tenantId);
  await mkdir(sourceDirectory,{recursive:true});
  await writeFile(path.join(sourceDirectory,fileId),bytes);
  const source={id:fileId,tenantId,storageKey:fileId,originalName:"contract.txt",contentType:"text/plain",size:bytes.length,checksum:"0".repeat(64),uploadedBy:"user-a",createdAt:new Date()};
  const fake=fakeDb([{tenantId,fileId}], [source]);
  try{
    const result=await migrateDocumentsFiles({db:fake.db,legacyRoot,documentsRoot,apply:true});
    assert.equal(result.copied,0);
    assert.equal(result.issues.length,1);
    assert.equal(fake.owned.size,0);
  }finally{await rm(root,{recursive:true,force:true});}
});
