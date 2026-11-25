import type { Db, Document } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type DocumentFileRecord = Document & {
  id: string; tenantId: string; originalName: string; contentType: string;
  size: number; checksum: string; storageKey: string; uploadedBy: string; createdAt: Date;
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg","image/png","image/webp","application/pdf","text/plain","text/csv"]);
function validContent(contentType:string,data:Buffer):boolean {
  if(contentType==="image/png")return data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(contentType==="image/jpeg")return data.length>=3&&data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
  if(contentType==="image/webp")return data.length>=12&&data.toString("ascii",0,4)==="RIFF"&&data.toString("ascii",8,12)==="WEBP";
  if(contentType==="application/pdf")return data.length>=5&&data.toString("ascii",0,5)==="%PDF-";
  if(contentType==="text/plain"||contentType==="text/csv"){
    if(data.includes(0))return false;
    try{new TextDecoder("utf-8",{fatal:true}).decode(data);return true;}catch{return false;}
  }
  return false;
}
export class DocumentsStorageAdapter {
  private readonly collection;
  constructor(private readonly db:Db,private readonly root:string){
    this.collection=db.collection<DocumentFileRecord>("tenant_document_files");
  }
  async initialize():Promise<void>{
    await mkdir(this.root,{recursive:true,mode:0o700});
    await this.collection.createIndex({tenantId:1,id:1},{unique:true,name:"tenant_document_files_tenant_id_unique"});
    await this.collection.createIndex({tenantId:1,createdAt:-1},{name:"tenant_document_files_created"});
  }
  private directory(tenantId:string):string{return path.resolve(this.root,createHash("sha256").update(tenantId).digest("hex"));}
  private filePath(tenantId:string,id:string):string{
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid document file identifier");
    const dir=this.directory(tenantId),target=path.resolve(dir,id);
    if(path.dirname(target)!==dir)throw new Error("Invalid document storage location");
    return target;
  }
  async store(tenantId:string,data:Buffer,originalName:string,contentType:string,uploadedBy:string):Promise<DocumentFileRecord>{
    if(!Buffer.isBuffer(data)||data.length===0||data.length>MAX_FILE_SIZE)throw new Error("Document file must be between 1 byte and 10 MB");
    const normalizedType=String(contentType||"").split(";")[0].trim().toLowerCase();
    if(!ALLOWED_TYPES.has(normalizedType)||!validContent(normalizedType,data))throw new Error("Unsupported or invalid document file content");
    const safeName=path.basename(String(originalName||"document").replace(/[\\/\r\n\0]/g,"_")).slice(0,180)||"document";
    const id=randomUUID(),directory=this.directory(tenantId),target=this.filePath(tenantId,id),temporary=this.filePath(tenantId,randomUUID()+".tmp");
    await mkdir(directory,{recursive:true,mode:0o700});
    try{
      await writeFile(temporary,data,{flag:"wx",mode:0o600});
      await rename(temporary,target);
      const record:DocumentFileRecord={id,tenantId,originalName:safeName,contentType:normalizedType,size:data.length,checksum:createHash("sha256").update(data).digest("hex"),storageKey:id,uploadedBy,createdAt:new Date()};
      await this.collection.insertOne(record);
      return record;
    }catch(error){
      await unlink(temporary).catch(()=>undefined);
      await unlink(target).catch(()=>undefined);
      throw error;
    }
  }
  async getMetadata(tenantId:string,fileId:string):Promise<DocumentFileRecord|null>{
    if(!/^[0-9a-f-]{36}$/i.test(fileId))return null;
    return this.collection.findOne({tenantId,id:fileId});
  }
  async read(tenantId:string,file:DocumentFileRecord):Promise<Buffer>{
    if(file.tenantId!==tenantId||file.id!==file.storageKey)throw new Error("Invalid tenant document file reference");
    const data=await readFile(this.filePath(tenantId,file.storageKey));
    if(data.length!==file.size||createHash("sha256").update(data).digest("hex")!==file.checksum)throw new Error("Document file integrity check failed");
    return data;
  }
  async remove(tenantId:string,fileId:string):Promise<void>{
    const record=await this.getMetadata(tenantId,fileId);if(!record)return;
    await unlink(this.filePath(tenantId,record.storageKey)).catch((error:any)=>{if(error?.code!=="ENOENT")throw error;});
    await this.collection.deleteOne({tenantId,id:fileId});
  }
}
