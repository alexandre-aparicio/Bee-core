import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";
import { readdir, unlink, rmdir } from "node:fs/promises";
import path from "node:path";

/**
 * Explicit cleanup for Documents test data.
 * Dry-run is the default. Use --execute --all-tenants to apply globally,
 * or --execute --tenant=<tenantId> to scope the operation.
 * Legacy Files records/blobs are never deleted by this utility.
 */
const execute=process.argv.includes("--execute");
const tenantArg=process.argv.find(value=>value.startsWith("--tenant="))?.slice("--tenant=".length);
const allTenants=process.argv.includes("--all-tenants");
if(Boolean(tenantArg)===allTenants)throw new Error("Choose exactly one scope: --tenant=<tenantId> or --all-tenants.");
const uri=process.env.MONGODB_URI??process.env.MONGO_URI;
if(!uri)throw new Error("MONGODB_URI (or MONGO_URI) is required.");
const dbName=process.env.MONGODB_DB??process.env.MONGO_DB??"bee_core";
const storageRoot=path.resolve(process.env.BEE_DOCUMENTS_DIR??"/data/bee-documents");
const client=new MongoClient(uri);
const names=["tenant_document_folders","tenant_documents","tenant_document_files"];
const result={mode:execute?"EXECUTE":"DRY RUN",scope:tenantArg??"all tenants",collections:{},ownedBlobs:0,legacyFilesPreserved:0};
try{
 await client.connect();
 const db=client.db(dbName);
 const tenantFilter=tenantArg?{tenantId:tenantArg}:{};
 const documentRows=await db.collection("tenant_documents").find(tenantFilter,{projection:{tenantId:1,fileId:1}}).toArray();
 const ownFileRows=await db.collection("tenant_document_files").find(tenantFilter,{projection:{tenantId:1,id:1,storageKey:1}}).toArray();
 const tenantIds=[...new Set([...documentRows,...ownFileRows].map(row=>String(row.tenantId)).filter(Boolean))];
 const legacyIds=new Set(documentRows.map(row=>String(row.fileId??"")).filter(Boolean));
 result.legacyFilesPreserved=legacyIds.size;
 for(const tenantId of tenantIds){
  const directory=path.resolve(storageRoot,createHash("sha256").update(tenantId).digest("hex"));
  for(const row of ownFileRows.filter(item=>item.tenantId===tenantId)){
   const key=String(row.storageKey??"");
   if(!/^[0-9a-f-]{36}$/i.test(key)||key!==row.id)continue;
   const target=path.resolve(directory,key);
   if(path.dirname(target)!==directory)continue;
   result.ownedBlobs++;
   if(execute)await unlink(target).catch(error=>{if(error?.code!=="ENOENT")throw error;});
  }
  if(execute){
   await readdir(directory).then(async entries=>{if(entries.length===0)await rmdir(directory);}).catch(error=>{if(error?.code!=="ENOENT")throw error;});
  }
 }
 for(const name of names){
  const collection=db.collection(name);
  const count=await collection.countDocuments(tenantFilter);
  result.collections[name]=count;
  if(execute&&count)await collection.deleteMany(tenantFilter);
 }
 for(const name of ["resource_access_policies"]){
  const filter={pluginId:"documents",...(tenantArg?{tenantId:tenantArg}:{})};
  const count=await db.collection(name).countDocuments(filter);
  result.collections[name]=count;
  if(execute&&count)await db.collection(name).deleteMany(filter);
 }
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(!execute)process.stdout.write("No changes made. Re-run with --execute and the same explicit scope to delete Documents-owned test data.\n");
 process.stdout.write("Legacy tenant_files records and Files storage are deliberately preserved; review them separately before any manual cleanup.\n");
}finally{await client.close();}
