const pending=new Map();
const DAYS=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
let role="member",section="time-tracking-day",activeSection="my-day",activeSubTab="status";
let session=null,mySchedule=null,history=[],corrections=[],teamCorrections=[],members=[],teamSchedules=[];
let selectedUserId="",timezone="Europe/Madrid",scheduleDraft=[],correctionTarget=null,requestedAt="",correctionReason="",reviewTarget=null,reviewNote="",busy=false,loading=false;
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const request=(path,method="GET",body=undefined)=>new Promise((resolve,reject)=>{
 const requestId=crypto.randomUUID();pending.set(requestId,{resolve,reject});
 parent.postMessage({type:"bee-plugin:api-request",requestId,path,method,...(body!==undefined?{body}:{})},"*");
 setTimeout(()=>{if(pending.has(requestId)){pending.delete(requestId);reject(new Error("La solicitud ha agotado el tiempo de espera."));}},30000);
});
window.addEventListener("message",event=>{
 const data=event.data;if(!data||typeof data!=="object")return;
 if(data.type==="bee-plugin:init"){role=String(data.role||"member");section=String(data.section||"time-tracking-day");activeSection=mapSection(section);activeSubTab=activeSection==="requests"?"mine":"status";void load();}
 if(data.type==="bee-plugin:api-response"&&typeof data.requestId==="string"){
  const item=pending.get(data.requestId);if(!item)return;pending.delete(data.requestId);
  if(Number(data.status)>=200&&Number(data.status)<300)item.resolve(data.payload||{});else item.reject(new Error(data.payload?.error||"No se pudo completar la operación de control horario."));
 }
});
parent.postMessage({type:"bee-plugin:ready"},"*");
function mapSection(value){if(["time-tracking-schedule","schedule"].includes(value))return "schedule";if(["time-tracking-history","history"].includes(value))return "history";if(["time-tracking-requests","requests"].includes(value))return "requests";return "my-day";}
function canManage(){return ["owner","admin","manager","super_admin","superadmin"].includes(role.toLowerCase());}
function notify(message,kind="message"){const node=$(kind);node.textContent=message;node.hidden=false;$(kind==="message"?"error":"message").hidden=true;}
function clearNotices(){$("error").hidden=true;$("message").hidden=true;}
function formatDate(value,options={dateStyle:"medium",timeStyle:"short"}){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("es-ES",options).format(d);}
function formatInput(value){const d=new Date(value);const offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,16);}
function emptySchedule(){return Array.from({length:7},(_,day)=>({day,enabled:false,start:"09:00",end:"17:00",breakMinutes:0}));}
function elapsed(){
 if(!session)return "—";const end=session.endedAt?new Date(session.endedAt).getTime():Date.now();const mins=Math.floor(Math.max(0,end-new Date(session.startedAt).getTime())/60000);
 return Math.floor(mins/60)+" h "+String(mins%60).padStart(2,"0")+" min";
}
function label(type){return ({clock_in:"Entrada",break_start:"Inicio de pausa",break_end:"Fin de pausa",clock_out:"Salida"})[type]||type;}
async function load(){
 loading=true;clearNotices();$("loading").hidden=false;$("content").hidden=true;
 try{
  const [status,historyResult,correctionResult,scheduleResult]=await Promise.all([
   request("/time-tracking/me/status"),request("/time-tracking/me/sessions?limit=30"),
   request("/time-tracking/me/corrections"),request("/time-tracking/me/schedule")
  ]);
  session=status.session??null;history=historyResult.sessions??[];corrections=correctionResult.corrections??[];mySchedule=scheduleResult.schedule??null;
  if(canManage())await loadTeam();
  render();
 }catch(error){notify(error.message||"No se pudo cargar el control horario.","error");$("loading").hidden=true;}
 finally{loading=false;}
}
async function loadTeam(){
 const [memberResult,correctionResult,scheduleResult]=await Promise.all([
  request("/time-tracking/team/members"),request("/time-tracking/team/corrections?status=pending"),request("/time-tracking/team/schedules")
 ]);
 members=memberResult.members??[];teamCorrections=correctionResult.corrections??[];teamSchedules=scheduleResult.schedules??[];
 if(!selectedUserId&&members.length)selectedUserId=members[0].userId;
 if(selectedUserId)applySelectedSchedule();
}
function applySelectedSchedule(){
 scheduleDraft=emptySchedule();timezone="Europe/Madrid";
 const schedule=teamSchedules.find(item=>item.userId===selectedUserId);
 if(!schedule)return;
 timezone=schedule.timezone||"Europe/Madrid";
 for(const day of schedule.days||[])scheduleDraft[day.day]={...day,enabled:true};
}
function setSection(next){activeSection=next;activeSubTab=next==="requests"?"mine":"status";render();}
function render(){
 $("loading").hidden=true;$("content").hidden=false;
 const manager=canManage();
 let html="";
 if(activeSection==="my-day"){
  html='<div class="content-heading"><div><p class="eyebrow">MI ESPACIO</p><h2>Mi jornada</h2><p>Controla tu fichaje y consulta la actividad registrada.</p></div></div><nav class="tabs"><button data-subtab="status" class="'+(activeSubTab==="status"?"active":"")+'">Estado actual</button><button data-subtab="activity" class="'+(activeSubTab==="activity"?"active":"")+'">Actividad</button></nav>';
  if(activeSubTab==="status"){
   const state=session?.status==="working"?"Trabajando":session?.status==="on_break"?"En pausa":"Sin jornada activa";
   html+='<section class="panel"><div class="clock-top"><span>ESTADO ACTUAL</span><span class="status '+(session?.status==="working"?"working":session?.status==="on_break"?"break":"")+'">'+state+'</span></div><div class="clock-time" id="clock-time">'+(session?elapsed():"Listo para empezar")+'</div><p>'+(session?"Entrada registrada: "+esc(formatDate(session.startedAt)):"Cuando comiences a trabajar, registra tu entrada.")+'</p><div class="actions">'+(!session?'<button class="btn primary" data-clock="clock-in" '+(busy?"disabled":"")+'>Fichar entrada</button>':session.status==="working"?'<button class="btn" data-clock="break-start" '+(busy?"disabled":"")+'>Iniciar pausa</button><button class="btn primary" data-clock="clock-out" '+(busy?"disabled":"")+'>Fichar salida</button>':session.status==="on_break"?'<button class="btn primary" data-clock="break-end" '+(busy?"disabled":"")+'>Finalizar pausa</button>':"")+'</div></section>';
   if(session)html+='<section class="panel"><div class="section-heading"><div><h3>Jornada en curso</h3><p>Los registros se guardan con la hora del servidor.</p></div></div>'+(session.events?.length?'<div class="events">'+session.events.map(event=>'<article class="event"><span class="dot"></span><div><strong>'+esc(label(event.type))+'</strong><small>'+esc(formatDate(event.occurredAt))+'</small></div><span class="source">Web</span></article>').join("")+'</div>':'<p>Todavía no hay actividad registrada.</p>')+'</section>';
  }else html+=historyPanel();
 }else if(activeSection==="schedule")html+=schedulePanel();
 else if(activeSection==="history"&&!manager)html+='<div class="content-heading"><div><p class="eyebrow">MI INFORMACIÓN</p><h2>Mi historial</h2><p>Consulta tus jornadas anteriores y solicita correcciones si lo necesitas.</p></div></div>'+historyPanel();
 else if(activeSection==="requests")html+=requestsPanel();
 else html+='<section class="empty">Esta sección no está disponible para tu perfil.</section>';
 $("content").innerHTML=html;
 $("content").querySelectorAll("[data-subtab]").forEach(button=>button.addEventListener("click",()=>{activeSubTab=button.dataset.subtab;render();}));
 $("content").querySelectorAll("[data-clock]").forEach(button=>button.addEventListener("click",()=>void act(button.dataset.clock)));
 $("content").querySelectorAll("[data-correct]").forEach(button=>button.addEventListener("click",()=>openCorrection(button.dataset.session,button.dataset.event,button.dataset.original)));
 $("content").querySelectorAll("[data-select-member]").forEach(select=>select.addEventListener("change",()=>{selectedUserId=select.value;applySelectedSchedule();render();}));
 $("content").querySelectorAll("[data-save-schedule]").forEach(button=>button.addEventListener("click",()=>void saveSchedule()));
 $("content").querySelectorAll("[data-day-enabled]").forEach(input=>input.addEventListener("change",()=>{const day=Number(input.dataset.dayEnabled);scheduleDraft[day].enabled=input.checked;render();}));
 $("content").querySelectorAll("[data-day-field]").forEach(input=>input.addEventListener("change",()=>{const day=Number(input.dataset.day),field=input.dataset.dayField;scheduleDraft[day][field]=field==="breakMinutes"?Number(input.value):input.value;}));
 $("content").querySelectorAll("[data-review]").forEach(button=>button.addEventListener("click",()=>{reviewTarget={id:button.dataset.review,decision:button.dataset.decision};reviewNote="";renderReviewModal();}));
 $("content").querySelectorAll("[data-open-correction]").forEach(button=>button.addEventListener("click",()=>openCorrection(button.dataset.session,button.dataset.event,button.dataset.original)));
}
function historyPanel(){
 return '<section class="panel"><div class="section-heading"><div><h3>Actividad reciente</h3><p>Últimas 30 jornadas cerradas.</p></div></div>'+(history.length?history.map(item=>'<article class="history-row"><div><strong>'+esc(formatDate(item.startedAt,{dateStyle:"medium"}))+'</strong><small>'+esc(formatDate(item.startedAt,{timeStyle:"short"}))+' – '+esc(formatDate(item.endedAt,{timeStyle:"short"}))+'</small></div><div class="row-actions"><span class="status">Cerrada</span><button class="link" data-correct="1" data-session="'+esc(item.id)+'" data-event="clock_in" data-original="'+esc(item.startedAt)+'">Corregir entrada</button>'+(item.endedAt?'<button class="link" data-correct="1" data-session="'+esc(item.id)+'" data-event="clock_out" data-original="'+esc(item.endedAt)+'">Corregir salida</button>':"")+'</div></article>').join(""):'<div class="empty">Todavía no hay jornadas anteriores.</div>')+'</section>';
}
function schedulePanel(){
 const manager=canManage();
 if(!manager)return '<div class="content-heading"><div><p class="eyebrow">MI INFORMACIÓN</p><h2>Mi horario</h2><p>Consulta el horario habitual que tienes asignado.</p></div></div><section class="panel"><div class="section-heading"><div><h3>Horario asignado</h3><p>'+esc(mySchedule?.timezone||"Zona horaria no configurada")+'</p></div></div>'+(mySchedule?.days?.length?(mySchedule.days.map(day=>'<article class="history-row"><strong>'+DAYS[day.day]+'</strong><span>'+esc(day.start)+' – '+esc(day.end)+'</span><small>Pausa prevista: '+Number(day.breakMinutes||0)+' min</small></article>').join("")):'<div class="empty">Aún no tienes un horario asignado. Consulta con el responsable de tu equipo.</div>')+'</section>';
 return '<div class="content-heading"><div><p class="eyebrow">GESTIÓN</p><h2>Planificación de horarios</h2><p>Configura el horario semanal de cada persona.</p></div></div><section class="panel"><div class="section-heading"><div><h3>Horario semanal</h3><p>Los días desactivados son días libres.</p></div></div><label class="field">Trabajador<select id="member-select" data-select-member>'+members.map(member=>'<option value="'+esc(member.userId)+'" '+(member.userId===selectedUserId?"selected":"")+'>'+esc(member.email)+' · '+esc(member.role)+'</option>').join("")+'</select></label><label class="field">Zona horaria<input id="timezone" value="'+esc(timezone)+'" placeholder="Europe/Madrid"></label><div class="table-wrap"><table class="table"><thead><tr><th>Día</th><th>Activo</th><th>Entrada</th><th>Salida</th><th>Pausa (min)</th></tr></thead><tbody>'+scheduleDraft.map((day,index)=>'<tr><th>'+DAYS[index]+'</th><td><input type="checkbox" data-day-enabled="'+index+'" data-day="'+index+'" '+(day.enabled?"checked":"")+'></td><td><input type="time" data-day="'+index+'" data-day-field="start" value="'+esc(day.start)+'" '+(!day.enabled?"disabled":"")+'></td><td><input type="time" data-day="'+index+'" data-day-field="end" value="'+esc(day.end)+'" '+(!day.enabled?"disabled":"")+'></td><td><input type="number" min="0" max="240" step="5" data-day="'+index+'" data-day-field="breakMinutes" value="'+Number(day.breakMinutes||0)+'" '+(!day.enabled?"disabled":"")+'></td></tr>').join("")+'</tbody></table></div><div class="actions"><button class="btn primary" data-save-schedule '+(!selectedUserId||busy?"disabled":"")+'>Guardar horario</button></div></section>';
}
function requestsPanel(){
 const manager=canManage();
 let html='<div class="content-heading"><div><p class="eyebrow">'+(manager?"GESTIÓN":"MI INFORMACIÓN")+'</p><h2>'+(manager?"Incidencias":"Mis solicitudes")+'</h2><p>'+(manager?"Gestiona las solicitudes de corrección de jornada.":"Consulta el estado de tus solicitudes de corrección.")+'</p></div></div><nav class="tabs"><button data-subtab="mine" class="'+(activeSubTab==="mine"?"active":"")+'">'+(manager?"Mis solicitudes":"Correcciones")+'</button>'+(manager?'<button data-subtab="team" class="'+(activeSubTab==="team"?"active":"")+'">Solicitudes del equipo '+(teamCorrections.length?"("+teamCorrections.length+")":"")+'</button>':"")+'</nav>';
 if(activeSubTab==="team"&&manager){
  html+='<section class="panel"><div class="section-heading"><div><h3>Solicitudes pendientes del equipo</h3><p>Aprueba o rechaza las correcciones solicitadas por las personas de tu equipo.</p></div></div>'+(teamCorrections.length?teamCorrections.map(item=>'<article class="correction"><div><strong>'+esc(item.userEmail)+' · '+(item.eventType==="clock_in"?"Entrada":"Salida")+'</strong><small>Original: '+esc(formatDate(item.originalAt))+' · Solicitado: '+esc(formatDate(item.requestedAt))+'</small><p>'+esc(item.reason)+'</p><small>Enviada: '+esc(formatDate(item.createdAt))+'</small></div><div class="row-actions"><button class="btn primary" data-review="'+esc(item.id)+'" data-decision="approved" '+(busy?"disabled":"")+'>Aprobar</button><button class="btn" data-review="'+esc(item.id)+'" data-decision="rejected" '+(busy?"disabled":"")+'>Rechazar</button></div></article>').join(""):'<div class="empty">No hay solicitudes pendientes.</div>')+'</section>';
 }else{
  html+='<section class="panel"><div class="section-heading"><div><h3>'+(manager?"Mis solicitudes":"Solicitudes enviadas")+'</h3><p>Estado de las correcciones de entrada y salida que has enviado.</p></div></div>'+(corrections.length?corrections.map(item=>'<article class="correction"><div><strong>'+(item.eventType==="clock_in"?"Corrección de entrada":"Corrección de salida")+'</strong><small>Original: '+esc(formatDate(item.originalAt))+' · Solicitado: '+esc(formatDate(item.requestedAt))+'</small><p>'+esc(item.reason)+'</p>'+(item.reviewNote?'<small>Respuesta: '+esc(item.reviewNote)+'</small>':"")+'</div><span class="status '+(item.status==="approved"?"working":"")+'">'+(item.status==="pending"?"Pendiente":item.status==="approved"?"Aprobada":"Rechazada")+'</span></article>').join(""):'<div class="empty">No has enviado solicitudes.</div>')+'</section>';
 }
 return html;
}
async function act(action){
 if(busy)return;busy=true;clearNotices();
 try{await request("/time-tracking/"+action,"POST",{operationId:crypto.randomUUID(),source:"web"});await load();notify(({ "clock-in":"Entrada registrada.","break-start":"Pausa iniciada.","break-end":"Pausa finalizada.","clock-out":"Salida registrada."})[action]||"Registro actualizado.");}
 catch(error){notify(error.message||"No se pudo registrar la acción.","error");}
 finally{busy=false;render();}
}
function openCorrection(sessionId,eventType,originalAt){
 correctionTarget={sessionId,eventType,originalAt};requestedAt=formatInput(originalAt);correctionReason="";renderCorrectionModal();
}
function closeCorrection(){correctionTarget=null;$("modal-root").replaceChildren();}
function renderCorrectionModal(){
 if(!correctionTarget)return;
 $("modal-root").innerHTML='<div class="modal-backdrop" id="correction-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="correction-title"><h2 id="correction-title">Solicitar corrección</h2><p>La modificación no se aplicará hasta que un responsable la apruebe.</p><label class="field">Fecha y hora correcta<input id="requested-at" type="datetime-local" value="'+esc(requestedAt)+'"></label><label class="field">Motivo<textarea id="correction-reason" rows="3" maxlength="1000" placeholder="Explica por qué debe corregirse este fichaje">'+esc(correctionReason)+'</textarea></label><div class="modal-footer"><button class="btn" id="cancel-correction">Cancelar</button><button class="btn primary" id="send-correction" '+(busy||!requestedAt||correctionReason.trim().length<5?"disabled":"")+'>Enviar solicitud</button></div></section></div>';
 $("requested-at").addEventListener("change",event=>{requestedAt=event.target.value;updateCorrectionButton();});
 $("correction-reason").addEventListener("input",event=>{correctionReason=event.target.value;updateCorrectionButton();});
 $("cancel-correction").addEventListener("click",closeCorrection);
 $("correction-backdrop").addEventListener("click",event=>{if(event.target.id==="correction-backdrop")closeCorrection();});
 $("send-correction").addEventListener("click",()=>void submitCorrection());
}
function updateCorrectionButton(){const button=$("send-correction");if(button)button.disabled=busy||!requestedAt||correctionReason.trim().length<5;}
async function submitCorrection(){
 if(!correctionTarget||!requestedAt||correctionReason.trim().length<5)return;busy=true;
 try{await request("/time-tracking/me/corrections","POST",{...correctionTarget,requestedAt:new Date(requestedAt).toISOString(),reason:correctionReason.trim()});closeCorrection();await load();notify("Solicitud de corrección enviada para su revisión.");}
 catch(error){notify(error.message||"No se pudo enviar la solicitud.","error");}
 finally{busy=false;render();}
}
async function saveSchedule(){
 const selectedTimezone=$("timezone").value.trim();const days=scheduleDraft.filter(day=>day.enabled).map(({day,start,end,breakMinutes})=>({day,start,end,breakMinutes}));
 if(!selectedUserId)return;busy=true;
 try{await request("/time-tracking/team/schedules/"+encodeURIComponent(selectedUserId),"PUT",{timezone:selectedTimezone,days});timezone=selectedTimezone;notify("Horario guardado.");}
 catch(error){notify(error.message||"No se pudo guardar el horario.","error");}
 finally{busy=false;render();}
}
function renderReviewModal(){
 if(!reviewTarget)return;
 const title=reviewTarget.decision==="approved"?"¿Aprobar corrección?":"¿Rechazar solicitud?";
 const copy=reviewTarget.decision==="approved"?"Se aplicará la hora solicitada a la jornada original.":"La solicitud se marcará como rechazada. Puedes indicar el motivo.";
 $("modal-root").innerHTML='<div class="modal-backdrop" id="review-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><h2 id="review-title">'+title+'</h2><p>'+copy+'</p>'+(reviewTarget.decision==="rejected"?'<label class="field">Motivo del rechazo (opcional)<textarea id="review-note" rows="3" maxlength="1000">'+esc(reviewNote)+'</textarea></label>':"")+'<div class="modal-footer"><button class="btn" id="cancel-review">Cancelar</button><button class="btn primary" id="confirm-review">Confirmar</button></div></section></div>';
 $("cancel-review").addEventListener("click",()=>{reviewTarget=null;$("modal-root").replaceChildren();});
 $("review-backdrop").addEventListener("click",event=>{if(event.target.id==="review-backdrop"){reviewTarget=null;$("modal-root").replaceChildren();}});
 if(reviewTarget.decision==="rejected")$("review-note").addEventListener("input",event=>{reviewNote=event.target.value;});
 $("confirm-review").addEventListener("click",()=>void confirmReview());
}
async function confirmReview(){
 if(!reviewTarget)return;const target=reviewTarget;reviewTarget=null;$("modal-root").replaceChildren();busy=true;
 try{await request("/time-tracking/team/corrections/"+encodeURIComponent(target.id),"PATCH",{decision:target.decision,reviewNote:target.decision==="rejected"?reviewNote.trim():""});await load();notify(target.decision==="approved"?"Corrección aprobada y aplicada.":"Solicitud rechazada.");}
 catch(error){notify(error.message||"No se pudo revisar la solicitud.","error");}
 finally{busy=false;render();}
}
$("refresh").addEventListener("click",()=>void load());

setInterval(()=>{const node=$("clock-time");if(node&&session?.status==="working")node.textContent=elapsed();},30000);
