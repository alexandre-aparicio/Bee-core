const pending=new Map();
let role="member",section="",currentFolderId=null,folders=[],documents=[],busy=false;
let shareFolder=null,shareMode="groups",shareTeams=[],shareUsers=[],targetTeams=[],targetUsers=[];
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
function date(value){if(!value)return "—";const parsed=new Date(value);return Number.isNaN(parsed.getTime())?"—":new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(parsed);}
function formatBytes(value){if(!Number.isFinite(value)||value<0)return "—";if(value<1024)return value+" B";const units=["KB","MB","GB"];let size=value/1024,index=0;while(size>=1024&&index<units.length-1){size/=1024;index++;}return size.toFixed(size>=10?1:2)+" "+units[index];}
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
 ...visibleFolders.map(folder=>'<article class="item folder"><h3>📁 '+escapeHtml(folder.name)+'</h3><div class="meta">Folder · '+Number(folder.documentCount||0)+' documents<br>Created '+escapeHtml(date(folder.createdAt))+'</div><div class="item-actions"><button class="btn" data-open="'+escapeHtml(folder.id)+'">Open folder</button>'+(folder.canManageShares?'<button class="btn" data-share="'+escapeHtml(folder.id)+'" data-mode="groups">Share group</button><button class="btn" data-share="'+escapeHtml(folder.id)+'" data-mode="users">Share user</button>':"")+(folder.canMove&&folder.parentId?'<button class="btn" data-folder-out="'+escapeHtml(folder.id)+'">Move out</button>':"")+'</div></article>'),
 ...documents.map(doc=>'<article class="item"><h3>📄 '+escapeHtml(doc.title)+'</h3><div class="meta">'+escapeHtml(doc.description||doc.originalName||"Document")+'<br>'+escapeHtml(doc.uploadedBy?.email||"")+' · '+escapeHtml(date(doc.uploadedAt))+'<br>'+escapeHtml(doc.visibility==="public"?"Public":"Private")+'</div><div class="item-actions"><button class="btn" data-details="'+escapeHtml(doc.id)+'">Details</button><button class="btn" data-download="'+escapeHtml(doc.id)+'">Download</button>'+(doc.canMove&&doc.folderId?'<button class="btn" data-doc-out="'+escapeHtml(doc.id)+'">Move out</button>':"")+'<button class="btn" data-publish="'+escapeHtml(doc.id)+'" data-public="'+String(doc.visibility==="public")+'">'+(doc.visibility==="public"?"Make private":"Publish")+'</button></div></article>')
 ];
 $("content").innerHTML=cards.length?'<div class="grid">'+cards.join("")+'</div>':'<div class="empty"><strong>'+(currentFolderId?"This folder is empty":"No documents yet")+'</strong><p>Create a folder or upload a text file to get started.</p></div>';
 $("content").querySelectorAll("[data-open]").forEach(button=>button.addEventListener("click",()=>openFolder(button.dataset.open)));
 $("content").querySelectorAll("[data-folder-out]").forEach(button=>button.addEventListener("click",()=>moveFolderOut(button.dataset.folderOut)));
 $("content").querySelectorAll("[data-doc-out]").forEach(button=>button.addEventListener("click",()=>moveDocumentOut(button.dataset.docOut)));
 $("content").querySelectorAll("[data-download]").forEach(button=>button.addEventListener("click",()=>downloadDocument(button.dataset.download)));
 $("content").querySelectorAll("[data-details]").forEach(button=>button.addEventListener("click",()=>openDetails(button.dataset.details)));
 $("content").querySelectorAll("[data-publish]").forEach(button=>button.addEventListener("click",()=>togglePublication(button.dataset.publish,button.dataset.public!=="true")));
 $("content").querySelectorAll("[data-share]").forEach(button=>button.addEventListener("click",()=>void openShareDialog(button.dataset.share,button.dataset.mode)));
}
async function load(){
 if(busy)return;busy=true;clearNotice();$("content").innerHTML='<div class="empty">Loading documents…</div>';
 try{
  const query=currentFolderId?"?folderId="+encodeURIComponent(currentFolderId):"";
  const [folderResult,initialDocuments]=await Promise.all([request("/documents/folders"),request("/documents"+query)]);
  folders=Array.isArray(folderResult.folders)?folderResult.folders:[];
  let documentResult=initialDocuments;
  if(currentFolderId&&!folders.some(item=>item.id===currentFolderId)){currentFolderId=null;documentResult=await request("/documents");}
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
 $("file").value="";
 if(!file.name.toLowerCase().endsWith(".txt")||(file.type&&file.type!=="text/plain")){notify("Only plain text (.txt) files are allowed.");return;}
 if(!file.size){notify("The selected file is empty.");return;}
 if(file.size>10*1024*1024){notify("The maximum file size is 10 MB.");return;}
 try{
  const uploaded=await request("/files","POST",{__beeBinary:true,contentType:"text/plain",fileName:file.name,base64:toBase64(await file.arrayBuffer())});
  if(!uploaded.file?.id)throw new Error("The file upload did not return a file reference.");
  await request("/documents","POST",{fileId:uploaded.file.id,folderId:currentFolderId,title:file.name});
  notify("Document uploaded successfully.",true);await load();
 }catch(error){notify(error.message||"Could not upload document.");}
});
async function moveFolderOut(id){
 const folder=folders.find(item=>item.id===id);if(!folder?.parentId)return;
 const parent=folders.find(item=>item.id===folder.parentId);
 try{await request("/documents/folders/"+encodeURIComponent(id)+"/location","PATCH",{parentId:parent?.parentId??null});notify("Folder moved successfully.",true);await load();}
 catch(error){notify(error.message||"Could not move folder.");}
}
async function moveDocumentOut(id){
 const doc=documents.find(item=>item.id===id);if(!doc?.folderId)return;
 const containing=folders.find(item=>item.id===doc.folderId);
 try{await request("/documents/"+encodeURIComponent(id)+"/location","PATCH",{folderId:containing?.parentId??null});notify("Document moved successfully.",true);await load();}
 catch(error){notify(error.message||"Could not move document.");}
}
function fromBase64(value){const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
async function downloadDocument(id){
 try{const doc=documents.find(item=>item.id===id);const result=await request("/documents/"+encodeURIComponent(id)+"/download","GET",undefined,"base64");const blob=new Blob([fromBase64(result.base64)],{type:result.contentType||"application/octet-stream"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=doc?.originalName||doc?.title||"document";link.style.display="none";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 catch(error){notify(error.message||"Could not download document.");}
}
async function togglePublication(id,published){
 try{await request("/documents/"+encodeURIComponent(id)+"/publication","PUT",{published});notify(published?"Document published.":"Document is private.",true);await load();}
 catch(error){notify(error.message||"Could not update publication.");}
}
function openDetails(id){
 const doc=documents.find(item=>item.id===id);if(!doc)return;
 $("dialog-root").innerHTML='<div class="overlay" id="dialog-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="details-title"><div class="dialog-head"><div><p class="eyebrow">DOCUMENT INFORMATION</p><h2 id="details-title">'+escapeHtml(doc.title)+'</h2><p>File metadata and upload history.</p></div><button class="btn" id="close-dialog" type="button">Close</button></div><dl class="details">'+[
 ["Document title",doc.title],["Original filename",doc.originalName],["Uploaded by",doc.uploadedBy?.email||"Unknown user"],["Uploaded on",date(doc.uploadedAt)],["Record created",date(doc.createdAt)],["Last updated",date(doc.updatedAt)],["File type",doc.fileContentType],["File size",formatBytes(Number(doc.fileSize))],["Access",doc.visibility==="public"?"Public":"Private"],["Description",doc.description||"—"],["Tags",(doc.tags||[]).join(", ")||"—"]
 ].map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value)+'</dd></div>').join("")+'</dl></section></div>';
 $("close-dialog").addEventListener("click",closeDialog);$("dialog-overlay").addEventListener("click",event=>{if(event.target.id==="dialog-overlay")closeDialog();});
}
function closeDialog(){$("dialog-root").replaceChildren();shareFolder=null;}
async function openShareDialog(id,mode){
 shareFolder=folders.find(item=>item.id===id)||null;if(!shareFolder)return;
 shareMode=mode==="users"?"users":"groups";shareTeams=[];shareUsers=[];targetTeams=[];targetUsers=[];
 try{const data=await request("/documents/folders/"+encodeURIComponent(id)+"/shares");shareTeams=data.teams||[];shareUsers=data.users||[];renderShareDialog();}
 catch(error){shareFolder=null;notify(error.message||"Could not load folder sharing.");}
}
function renderShareDialog(){
 if(!shareFolder)return;
 const teamChips=shareTeams.map(team=>'<span class="chip">'+escapeHtml(team.name)+' <button type="button" data-remove-team="'+escapeHtml(team.id)+'" aria-label="Remove '+escapeHtml(team.name)+'">×</button></span>').join("");
 const userChips=shareUsers.map(user=>'<span class="chip">'+escapeHtml(user.email)+' <button type="button" data-remove-user="'+escapeHtml(user.id)+'" aria-label="Remove '+escapeHtml(user.email)+'">×</button></span>').join("");
 const results=shareMode==="groups"?targetTeams.map(team=>'<div class="result"><span>'+escapeHtml(team.name)+'</span><button class="btn" type="button" data-add-team="'+escapeHtml(team.id)+'">Add</button></div>').join(""):targetUsers.map(user=>'<div class="result"><span>'+escapeHtml(user.email)+'</span><button class="btn" type="button" data-add-user="'+escapeHtml(user.id)+'">Add</button></div>').join("");
 $("dialog-root").innerHTML='<div class="overlay" id="dialog-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><div class="dialog-head"><div><p class="eyebrow">FOLDER ACCESS</p><h2 id="share-title">Share '+escapeHtml(shareFolder.name)+'</h2><p>Shared members can view and download documents in this folder and its subfolders.</p></div><button class="btn" id="close-dialog" type="button">Close</button></div><form id="share-search" class="dialog-search"><select id="share-mode" aria-label="Search type"><option value="groups" '+(shareMode==="groups"?"selected":"")+'>Groups</option><option value="users" '+(shareMode==="users"?"selected":"")+'>Users</option></select><input id="share-query" value="'+escapeHtml($("share-query")?.value||"")+'" placeholder="Search by name or email" autocomplete="off"><button class="btn" type="submit">Search</button></form><div class="results">'+(results||'<p>No matching results.</p>')+'</div><h3>Shared groups</h3><div class="chips">'+(teamChips||'<span class="meta">No groups selected.</span>')+'</div><h3>Shared users</h3><div class="chips">'+(userChips||'<span class="meta">No users selected.</span>')+'</div><div class="dialog-footer"><button class="btn" id="cancel-share" type="button">Cancel</button><button class="btn primary" id="save-share" type="button">Save sharing</button></div></section></div>';
 $("close-dialog").addEventListener("click",closeDialog);$("cancel-share").addEventListener("click",closeDialog);$("dialog-overlay").addEventListener("click",event=>{if(event.target.id==="dialog-overlay")closeDialog();});
 $("share-mode").addEventListener("change",event=>{shareMode=event.target.value;targetTeams=[];targetUsers=[];renderShareDialog();});
 $("share-search").addEventListener("submit",event=>{event.preventDefault();void searchShareTargets($("share-query").value);});
 $("dialog-root").querySelectorAll("[data-add-team]").forEach(button=>button.addEventListener("click",()=>{const team=targetTeams.find(item=>item.id===button.dataset.addTeam);if(team&&!shareTeams.some(item=>item.id===team.id))shareTeams=[...shareTeams,team];targetTeams=[];renderShareDialog();}));
 $("dialog-root").querySelectorAll("[data-add-user]").forEach(button=>button.addEventListener("click",()=>{const user=targetUsers.find(item=>item.id===button.dataset.addUser);if(user&&!shareUsers.some(item=>item.id===user.id))shareUsers=[...shareUsers,user];targetUsers=[];renderShareDialog();}));
 $("dialog-root").querySelectorAll("[data-remove-team]").forEach(button=>button.addEventListener("click",()=>{shareTeams=shareTeams.filter(item=>item.id!==button.dataset.removeTeam);renderShareDialog();}));
 $("dialog-root").querySelectorAll("[data-remove-user]").forEach(button=>button.addEventListener("click",()=>{shareUsers=shareUsers.filter(item=>item.id!==button.dataset.removeUser);renderShareDialog();}));
 $("save-share").addEventListener("click",()=>void saveFolderShares());
}
async function searchShareTargets(query){
 const value=String(query||"").trim();if(!value){targetTeams=[];targetUsers=[];renderShareDialog();return;}
 try{const result=await request("/documents/share-targets?q="+encodeURIComponent(value));targetTeams=shareMode==="groups"?(result.teams||[]):[];targetUsers=shareMode==="users"?(result.users||[]):[];renderShareDialog();}
 catch(error){notify(error.message||"Could not search sharing targets.");}
}
async function saveFolderShares(){
 if(!shareFolder)return;
 try{await request("/documents/folders/"+encodeURIComponent(shareFolder.id)+"/shares","PUT",{teamIds:shareTeams.map(item=>item.id),userIds:shareUsers.map(item=>item.id)});closeDialog();notify("Folder sharing saved.",true);await load();}
 catch(error){notify(error.message||"Could not save folder sharing.");}
}
$("create").classList.add("hidden");
