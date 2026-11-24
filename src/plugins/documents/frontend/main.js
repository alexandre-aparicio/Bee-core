const pending=new Map();
let role="member",section="",currentFolderId=null,folders=[],documents=[],busy=false;
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const request=(path,method="GET",body=undefined,responseType="json")=>new Promise((resolve,reject)=>{
 const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});
 parent.postMessage({type:"bee-plugin:api-request",requestId,path,method,...(body!==undefined?{body}:{}),...(responseType!=="json"?{responseType}:{})},"*");
 setTimeout(()=>{if(pending.has(requestId)){pending.delete(requestId);reject(new Error("The request timed out."));}},30000);
});
window.addEventListener("message",event=>{
 const data=event.data;if(!data||typeof data!=="object")return;
 if(data.type==="bee-plugin:init"){role=String(data.role||"member");section=String(data.section||"");void load();return;}
 if(data.type==="bee-plugin:api-response"&&typeof data.requestId==="string"){
  const item=pending.get(data.requestId);if(!item)return;pending.delete(data.requestId);
  if(Number(data.status)>=200&&Number(data.status)<300)item.resolve(data.payload||{});else item.reject(new Error(data.payload?.error||"Documents request failed ("+data.status+")"));
 }
});
parent.postMessage({type:"bee-plugin:ready"},"*");
function notify(message,success=false){const node=$("notice");node.textContent=message;node.classList.remove("hidden","success");if(success)node.classList.add("success");}
function clearNotice(){$("notice").classList.add("hidden");}
function date(value){if(!value)return "";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"":parsed.toLocaleDateString();}
function currentFolder(){return folders.find(item=>item.id===currentFolderId)||null;}
function renderCrumbs(){
 const trail=[];let cursor=currentFolder();let guard=0;
 while(cursor&&guard++<30){trail.unshift(cursor);cursor=folders.find(item=>item.id===cursor.parentId)||null;}
 $("crumbs").innerHTML='<button data-folder="" class="'+(!currentFolderId?"current":"")+'">All documents</button>'+trail.map((item,index)=>'<span>/</span><button data-folder="'+escapeHtml(item.id)+'" class="'+(index===trail.length-1?"current":"")+'">'+escapeHtml(item.name)+'</button>').join("");
 $("crumbs").querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>openFolder(button.dataset.folder||null)));
}
function render(){
 renderCrumbs();
 const visibleFolders=folders.filter(item=>(item.parentId||null)===(currentFolderId||null));
 const cards=[
 ...visibleFolders.map(folder=>'<article class="item folder"><h3>📁 '+escapeHtml(folder.name)+'</h3><div class="meta">Folder · '+Number(folder.documentCount||0)+' documents<br>Created '+escapeHtml(date(folder.createdAt))+'</div><div class="item-actions"><button class="btn" data-open="'+escapeHtml(folder.id)+'">Open folder</button>'+(folder.canMove&&folder.parentId?'<button class="btn" data-folder-out="'+escapeHtml(folder.id)+'">Move out</button>':"")+'</div></article>'),
 ...documents.map(doc=>'<article class="item"><h3>📄 '+escapeHtml(doc.title)+'</h3><div class="meta">'+escapeHtml(doc.originalName||"Document")+'<br>'+escapeHtml(doc.uploadedBy?.email||"")+' · '+escapeHtml(date(doc.uploadedAt))+'<br>'+escapeHtml(doc.visibility==="public"?"Public":"Private")+'</div><div class="item-actions"><button class="btn" data-download="'+escapeHtml(doc.id)+'">Download</button>'+(doc.canMove&&doc.folderId?'<button class="btn" data-doc-out="'+escapeHtml(doc.id)+'">Move out</button>':"")+'<button class="btn" data-publish="'+escapeHtml(doc.id)+'" data-public="'+String(doc.visibility==="public")+'">'+(doc.visibility==="public"?"Make private":"Publish")+'</button></div></article>')
 ];
 $("content").innerHTML=cards.length?'<div class="grid">'+cards.join("")+'</div>':'<div class="empty"><strong>'+(currentFolderId?"This folder is empty":"No documents yet")+'</strong><p>Create a folder or upload a text file to get started.</p></div>';
 $("content").querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",()=>openFolder(button.dataset.open)));
 $("content").querySelectorAll("[data-folder-out]").forEach(button=>button.addEventListener("click",()=>moveFolderOut(button.dataset.folderOut)));
 $("content").querySelectorAll("[data-doc-out]").forEach(button=>button.addEventListener("click",()=>moveDocumentOut(button.dataset.docOut)));
 $("content").querySelectorAll("[data-download]").forEach(button=>button.addEventListener("click",()=>downloadDocument(button.dataset.download)));
 $("content").querySelectorAll("[data-publish]").forEach(button=>button.addEventListener("click",()=>togglePublication(button.dataset.publish,button.dataset.public!=="true")));
}
async function load(){
 if(busy)return;busy=true;clearNotice();$("content").innerHTML='<div class="empty">Loading documents…</div>';
 try{
  const query=currentFolderId?"?folderId="+encodeURIComponent(currentFolderId):"";
  const [folderResult,initialDocuments]=await Promise.all([request("/documents/folders"),request("/documents"+query)]);
  folders=Array.isArray(folderResult.folders)?folderResult.folders:[];
  let documentResult=initialDocuments;
  if(currentFolderId&&!folders.some(item=>item.id===currentFolderId)){
   currentFolderId=null;
   documentResult=await request("/documents");
  }
  documents=Array.isArray(documentResult.documents)?documentResult.documents:[];
  render();
 }catch(error){notify(error.message||"Could not load documents.");$("content").innerHTML='<div class="empty">Documents could not be loaded. Check your access and try again.</div>';}
 finally{busy=false;}
}
async function openFolder(id){currentFolderId=id;await load();}
$("refresh").addEventListener("click",()=>void load());
$("new-folder").addEventListener("click",()=>{$("create").classList.remove("hidden");$("folder-name").focus();});
$("cancel-folder").addEventListener("click",()=>{$("create").classList.add("hidden");$("folder-name").value="";});
$("create").addEventListener("submit",async event=>{
 event.preventDefault();const name=$("folder-name").value.trim();if(!name)return;
 try{await request("/documents/folders","POST",{name,parentId:currentFolderId});$("create").classList.add("hidden");$("folder-name").value="";notify("Folder created.",true);await load();}
 catch(error){notify(error.message||"Could not create folder.");}
});
function toBase64(buffer){const bytes=new Uint8Array(buffer);let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary);}
$("upload").addEventListener("click",async()=>{
 const file=$("file").files?.[0];if(!file){notify("Choose a plain text file first.");return;}
 if(file.size>1024*1024){notify("Text files must be smaller than 1 MB.");return;}
 try{
  const uploaded=await request("/files","POST",{__beeBinary:true,contentType:"text/plain",fileName:file.name,base64:toBase64(await file.arrayBuffer())});
  if(!uploaded.file?.id)throw new Error("The file upload did not return a file reference.");
  await request("/documents","POST",{fileId:uploaded.file.id,folderId:currentFolderId,title:file.name});
  $("file").value="";notify("Document uploaded.",true);await load();
 }catch(error){notify(error.message||"Could not upload document.");}
});
async function moveFolderOut(id){try{await request("/documents/folders/"+encodeURIComponent(id)+"/location","PATCH",{parentId:null});notify("Folder moved to the root.",true);await load();}catch(error){notify(error.message||"Could not move folder.");}}
async function moveDocumentOut(id){try{await request("/documents/"+encodeURIComponent(id)+"/location","PATCH",{folderId:null});notify("Document moved to the root.",true);await load();}catch(error){notify(error.message||"Could not move document.");}}
function fromBase64(value){const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
async function downloadDocument(id){
 try{const result=await request("/documents/"+encodeURIComponent(id)+"/download","GET",undefined,"base64");const blob=new Blob([fromBase64(result.base64)],{type:result.contentType||"application/octet-stream"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="document";link.click();URL.revokeObjectURL(link.href);}
 catch(error){notify(error.message||"Could not download document.");}
}
async function togglePublication(id,published){
 try{await request("/documents/"+encodeURIComponent(id)+"/publication","PUT",{published});notify(published?"Document published.":"Document is private.",true);await load();}
 catch(error){notify(error.message||"Could not update publication.");}
}
