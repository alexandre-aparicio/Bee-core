const pending=new Map();
const CAPABILITIES=[
 {id:"device.status.write",label:"Device status"},{id:"scanner.use",label:"Barcode / QR scanner"},
 {id:"camera.capture",label:"Camera capture"},{id:"catalog.read",label:"Read product catalog"},
 {id:"inventory.read",label:"Read inventory"},{id:"inventory.write",label:"Update inventory"},
 {id:"pos.session.read",label:"Read POS sessions"},{id:"pos.order.write",label:"Create or update POS orders"},
 {id:"location.read",label:"Share location"},{id:"notifications.receive",label:"Receive notifications"}
];
let role="member",section="",devices=[],canManage=false,selectedCapabilities=["device.status.write","scanner.use"];
let qrPayload="",qrChallengeId="",qrExpiresAt="",grantsByDevice={},pendingAction=null,busy=false;
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const request=(path,method="GET",body=undefined)=>new Promise((resolve,reject)=>{
 const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});
 parent.postMessage({type:"bee-plugin:api-request",requestId,path,method,...(body!==undefined?{body}:{})},"*");
 setTimeout(()=>{if(pending.has(requestId)){pending.delete(requestId);reject(new Error("The request timed out."));}},30000);
});
window.addEventListener("message",event=>{
 const data=event.data;if(!data||typeof data!=="object")return;
 if(data.type==="bee-plugin:init"){role=String(data.role||"member");section=String(data.section||"");void load();return;}
 if(data.type==="bee-plugin:api-response"&&typeof data.requestId==="string"){
  const item=pending.get(data.requestId);if(!item)return;pending.delete(data.requestId);
  if(Number(data.status)>=200&&Number(data.status)<300)item.resolve(data.payload||{});else item.reject(new Error(data.payload?.error||"Connected Devices request failed ("+data.status+")"));
 }
});
parent.postMessage({type:"bee-plugin:ready"},"*");
function notice(message,kind="message"){const node=$(kind);node.textContent=message;node.hidden=false;if(kind==="message")$("error").hidden=true;else $("message").hidden=true;}
function clearNotices(){$("message").hidden=true;$("error").hidden=true;}
function fmtDate(value){if(!value)return "Not connected yet";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString();}
function renderCapabilities(){
 $("capabilities").innerHTML=CAPABILITIES.map(item=>'<label><input type="checkbox" data-request-cap="'+item.id+'" '+(selectedCapabilities.includes(item.id)?"checked":"")+'><span>'+esc(item.label)+'</span></label>').join("");
 $("capabilities").querySelectorAll("[data-request-cap]").forEach(input=>input.addEventListener("change",()=>{const id=input.dataset.requestCap;selectedCapabilities=input.checked?[...selectedCapabilities,id]:selectedCapabilities.filter(item=>item!==id);$("create-pairing").disabled=selectedCapabilities.length===0;}));
 $("create-pairing").disabled=busy||selectedCapabilities.length===0;
}
function renderQr(){
 $("pairing").hidden=!qrPayload;
 if(!qrPayload)return;
 $("pairing-payload").textContent=qrPayload;
 $("pairing-expiry").textContent="Expires: "+fmtDate(qrExpiresAt);
 const container=$("qr");container.replaceChildren();
 if(typeof QRCode!=="undefined")new QRCode(container,{text:qrPayload,width:180,height:180,colorDark:"#111111",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel?.M??0});
 else container.textContent="QR renderer unavailable. Copy the pairing link instead.";
}
function selectedGrants(device){return grantsByDevice[device.id]??[];}
function renderDevices(){
 $("loading").hidden=true;
 $("empty").hidden=devices.length!==0;
 $("devices").hidden=devices.length===0;
 $("devices").innerHTML=devices.map(device=>{
  const status=String(device.status||"pending");
  const actions=[
   '<button type="button" data-action="unlink" data-id="'+esc(device.id)+'" '+(["unlinked","revoked"].includes(status)?"disabled":"")+'>Unlink</button>',
   '<button type="button" data-action="revoke" data-id="'+esc(device.id)+'" '+(["revoked","unlinked"].includes(status)?"disabled":"")+'>Revoke access</button>',
   ...(canManage?[
    '<button type="button" data-action="suspend" data-id="'+esc(device.id)+'" '+(status!=="active"?"disabled":"")+'>Suspend</button>',
    '<button type="button" data-action="activate" data-id="'+esc(device.id)+'" '+(status!=="suspended"?"disabled":"")+'>Reactivate</button>',
    '<button type="button" class="danger" data-action="delete" data-id="'+esc(device.id)+'">Delete</button>'
   ]:[])
  ].join("");
  const pendingGrants=status==="pending"&&canManage?'<div class="grant-title">Review requested access</div><div class="grant-list">'+(device.requestedCapabilities||[]).map(scope=>'<label><input type="checkbox" data-grant="'+esc(scope)+'" data-device="'+esc(device.id)+'" '+(selectedGrants(device).includes(scope)?"checked":"")+'> '+esc(scope)+'</label>').join("")+'</div><button class="btn primary" type="button" data-action="approve" data-id="'+esc(device.id)+'" '+(selectedGrants(device).length?"":"disabled")+'>Approve selected capabilities</button>':"";
  const scopes=status!=="pending"?'<div class="scopes"><span class="muted-label">Approved capabilities</span>'+((device.grantedCapabilities||[]).map(scope=>'<span class="scope">'+esc(scope)+'</span>').join("")||'<span class="scope">No capabilities granted</span>')+'</div>':"";
  const owner=canManage?'<small>Owner: '+esc(device.owner?.name||device.owner?.email||"Former member")+'</small>':"";
  return '<article class="card"><div class="card-head"><div class="device-icon">▣</div><div class="device-title"><h3>'+esc(device.name)+'</h3><p>'+esc(device.deviceType)+' · '+esc(device.platform)+(device.appVersion?" · "+esc(device.appVersion):"")+'</p>'+owner+'</div><span class="status '+esc(status)+'">'+esc(status)+'</span><details class="menu"><summary aria-label="Device actions" title="Device actions">⋮</summary><div role="menu">'+actions+'</div></details></div>'+scopes+(pendingGrants?'<div class="panel">'+pendingGrants+'</div>':"")+'<footer class="card-footer"><span>Last seen: '+esc(fmtDate(device.lastSeenAt))+'</span>'+(status==="unlinked"?"<span>Unlinked · Pair again with a new QR code</span>":"")+'</footer></article>';
 }).join("");
 $("devices").querySelectorAll("[data-grant]").forEach(input=>input.addEventListener("change",()=>{const id=input.dataset.device,scope=input.dataset.grant;const current=grantsByDevice[id]||[];grantsByDevice[id]=input.checked?[...current,scope]:current.filter(item=>item!==scope);const button=$("devices").querySelector('[data-action="approve"][data-id="'+CSS.escape(id)+'"]');if(button)button.disabled=grantsByDevice[id].length===0;}));
 $("devices").querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>void handleAction(button.dataset.action,button.dataset.id)));
}
async function load(){
 clearNotices();$("loading").hidden=false;
 try{
  const result=await request("/connected-devices");
  devices=Array.isArray(result.devices)?result.devices:[];canManage=Boolean(result.canManage);
  for(const device of devices)if(device.status==="pending"&&!grantsByDevice[device.id])grantsByDevice[device.id]=[...(device.requestedCapabilities||[])];
  renderCapabilities();renderDevices();
 }catch(error){$("loading").hidden=true;notice(error.message||"Could not load devices.","error");}
}
async function createPairing(){
 if(!selectedCapabilities.length)return;clearNotices();$("create-pairing").disabled=true;
 try{const result=await request("/connected-devices/pairing-challenges","POST",{requestedCapabilities:selectedCapabilities});qrPayload=result.qrPayload;qrChallengeId=result.challengeId;qrExpiresAt=result.expiresAt;renderQr();}
 catch(error){notice(error.message||"Could not create pairing request.","error");}
 finally{$("create-pairing").disabled=false;}
}
async function cancelPairing(){
 if(qrChallengeId){try{await request("/connected-devices/pairing-challenges/"+encodeURIComponent(qrChallengeId)+"/cancel","POST",{});}
 catch(error){notice(error.message||"Could not cancel pairing code.","error");return;}}
 qrPayload="";qrChallengeId="";qrExpiresAt="";renderQr();notice("Pairing code cancelled.");
}
function showConfirm(type,device){
 const copy={
  suspend:["Suspend device?","Suspend "+device.name+"? Device requests will be rejected until an administrator reactivates it.","Suspend",false],
  revoke:["Revoke device access?","Revoke access for "+device.name+"? Its credential will be permanently invalidated and this cannot be undone.","Revoke access",true],
  unlink:["Unlink device?","Unlink "+device.name+"? Its current credential will stop working. The history is retained and it can pair again with a new QR code.","Unlink device",false],
  delete:["Delete device permanently?","Permanently delete "+device.name+" and its device record? This cannot be undone.","Delete permanently",true]
 }[type];
 pendingAction={type,device,title:copy[0],message:copy[1],confirmLabel:copy[2],danger:copy[3]};
 renderModal();
}
function renderModal(){
 if(!pendingAction){$("modal-root").replaceChildren();return;}
 $("modal-root").innerHTML='<div class="modal-backdrop" id="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true"><p class="eyebrow">DEVICE SECURITY</p><h2>'+esc(pendingAction.title)+'</h2><p>'+esc(pendingAction.message)+'</p><div class="modal-footer"><button class="btn" id="modal-cancel">Cancel</button><button class="btn '+(pendingAction.danger?"danger":"primary")+'" id="modal-confirm">'+esc(pendingAction.confirmLabel)+'</button></div></section></div>';
 $("modal-cancel").addEventListener("click",()=>{pendingAction=null;renderModal();});
 $("modal-backdrop").addEventListener("click",event=>{if(event.target.id==="modal-backdrop"){pendingAction=null;renderModal();}});
 $("modal-confirm").addEventListener("click",()=>void confirmAction());
}
async function confirmAction(){
 if(!pendingAction||busy)return;const action=pendingAction;pendingAction=null;renderModal();busy=true;
 try{
  await request("/connected-devices/"+encodeURIComponent(action.device.id)+"/"+action.type,"POST",{});
  notice(action.type==="suspend"?"Device suspended.":action.type==="revoke"?"Device access revoked.":action.type==="unlink"?"Device unlinked. It can be paired again with a new QR code.":"Device deleted.");
  await load();
 }catch(error){notice(error.message||"The device action could not be completed.","error");}
 finally{busy=false;}
}
async function activate(deviceId){
 try{await request("/connected-devices/"+encodeURIComponent(deviceId)+"/activate","POST",{});await load();notice("Device reactivated.");}
 catch(error){notice(error.message||"Could not reactivate device.","error");}
}
async function approve(deviceId){
 const grants=grantsByDevice[deviceId]||[];if(!grants.length)return;
 try{await request("/connected-devices/"+encodeURIComponent(deviceId)+"/approve","POST",{grantedCapabilities:grants});await load();notice("Device approved with the selected capabilities.");}
 catch(error){notice(error.message||"Could not approve device.","error");}
}
async function handleAction(action,id){
 const device=devices.find(item=>item.id===id);if(!device)return;
 if(action==="approve")return approve(id);
 if(action==="activate")return activate(id);
 if(["suspend","revoke","unlink","delete"].includes(action))showConfirm(action,device);
}
$("refresh").addEventListener("click",()=>void load());
$("create-pairing").addEventListener("click",()=>void createPairing());
$("cancel-pairing").addEventListener("click",()=>void cancelPairing());
$("copy-payload").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(qrPayload);notice("Pairing link copied.");}catch{notice("Select and copy the pairing link from the QR payload field.");}});
