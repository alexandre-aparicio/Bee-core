import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DocumentsStorageAdapter } from "../src/plugins/documents/documents-storage.adapter.ts";

function fakeDb(){
 const rows=new Map<string,any>();
 const collection={
  createIndex:async()=>undefined,
  insertOne:async(row:any)=>{rows.set(row.tenantId+":"+row.id,row);},
  findOne:async(query:any)=>rows.get(query.tenantId+":"+query.id)??null,
  deleteOne:async(query:any)=>({deletedCount:rows.delete(query.tenantId+":"+query.id)?1:0})
 };
 return {collection:()=>collection} as any;
}
test("Documents storage keeps content tenant-scoped and verifies stored bytes",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"bee-documents-test-"));
 try{
  const storage=new DocumentsStorageAdapter(fakeDb(),root);
  await storage.initialize();
  const payload=Buffer.from("Independent Documents storage");
  const record=await storage.store("tenant-a",payload,"readme.txt","text/plain","user-a");
  assert.equal(record.size,payload.length);
  assert.equal(record.checksum.length,64);
  assert.equal((await storage.getMetadata("tenant-a",record.id))?.id,record.id);
  assert.equal(await storage.getMetadata("tenant-b",record.id),null);
  assert.deepEqual(await storage.read("tenant-a",record),payload);
  await assert.rejects(()=>storage.read("tenant-b",record));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("Documents storage rejects unsupported or mismatched file content",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"bee-documents-invalid-"));
 try{
  const storage=new DocumentsStorageAdapter(fakeDb(),root);
  await storage.initialize();
  await assert.rejects(()=>storage.store("tenant-a",Buffer.from("not a PDF"),"bad.pdf","application/pdf","user-a"));
  await assert.rejects(()=>storage.store("tenant-a",Buffer.from("x"),"bad.exe","application/x-msdownload","user-a"));
 }finally{await rm(root,{recursive:true,force:true});}
});
