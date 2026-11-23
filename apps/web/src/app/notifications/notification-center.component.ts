import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BeeIconComponent } from '../core/icons/bee-icon.component';
type NotificationItem={id:string;title:string;message:string;category:string;priority:string;readAt:Date|null;createdAt:Date;action?:{label:string;route:string}};
@Component({selector:'bee-notification-center',standalone:true,imports:[CommonModule,BeeIconComponent],template:`<div class="bee-notify"><button class="bee-notify-trigger" type="button" (click)="toggle()" aria-label="Notifications"><bee-icon name="notifications" size="18px"></bee-icon>@if(unread>0){<i>{{unread>99?'99+':unread}}</i>}</button>@if(open){<section class="bee-notify-panel"><header><strong>Notifications</strong><button type="button" (click)="markAll()" [disabled]="unread===0">Mark all read</button></header><div class="bee-notify-list">@if(error){<p class="bee-notify-error">{{error}}</p>}@if(loading){<p class="bee-notify-empty">Loading…</p>}@else if(items.length===0){<p class="bee-notify-empty">You're all caught up.</p>}@for(item of items;track item.id){<article [class.unread]="!item.readAt"><button class="bee-notify-item" type="button" (click)="openItem(item)"><span class="bee-notify-dot">{{item.category==='security'?'◈':item.category==='plugins'?'▣':'●'}}</span><span class="bee-notify-text"><b>{{item.title}}</b><span>{{item.message}}</span><small>{{time(item.createdAt)}}</small></span></button></article>}</div><footer><button type="button" (click)="load()">Refresh</button></footer></section>}</div>`,
styles:[`
.bee-notify{position:relative;display:inline-flex;align-items:center;color:inherit}
.bee-notify-trigger{position:relative;display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--border,#8885);background:var(--panel,#8881);color:inherit;border-radius:10px;padding:0;cursor:pointer;font-size:17px}
.bee-notify-trigger i{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:var(--purple,#8c72ff);color:white;font:700 10px/18px Arial,sans-serif;text-align:center}
.bee-notify-panel{position:absolute;z-index:1000;right:0;top:calc(100% + 10px);width:min(370px,calc(100vw - 24px));max-height:480px;background:var(--panel,#8881);color:inherit;border:1px solid var(--border,#8885);border-radius:16px;box-shadow:0 20px 55px #0a18352b;overflow:hidden}
.bee-notify-panel header,.bee-notify-panel footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border,#8885)}
.bee-notify-panel header strong{font-size:14px;font-weight:600}
.bee-notify-panel header button,.bee-notify-panel footer button{background:transparent;border:0;color:inherit;cursor:pointer;font:600 11px Arial,sans-serif}
.bee-notify-panel header button:disabled{opacity:.4;cursor:not-allowed}
.bee-notify-list{overflow:auto;max-height:385px}
.bee-notify-item{display:flex;align-items:flex-start;gap:11px;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:13px 15px;cursor:pointer}
.bee-notify-item:hover{background:color-mix(in srgb,var(--purple,#8c72ff) 6%,transparent)}
.bee-notify-list article{border-bottom:1px solid var(--border,#8885)}
.bee-notify-list article.unread{background:color-mix(in srgb,var(--purple,#8c72ff) 6%,transparent)}
.bee-notify-dot{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:9px;background:var(--purple,#777);color:white;font-size:13px}
.bee-notify-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.bee-notify-text b{font-size:12px;line-height:1.4;font-weight:600}
.bee-notify-text span{font-size:11px;line-height:1.5;opacity:.72}
.bee-notify-text small{font-size:10px;opacity:.58}
.bee-notify-empty{padding:24px;text-align:center;opacity:.65;font-size:12px}
.bee-notify-error{padding:12px 15px;color:#dc6262;font-size:11px}
`]
})
export class BeeNotificationCenterComponent implements OnChanges,OnDestroy{
 @Input() accessToken='';@Input() tenantId='';
 unread=0;items:NotificationItem[]=[];open=false;loading=false;error="";socket?:WebSocket;retry?:ReturnType<typeof setTimeout>;stopped=false;
 ngOnChanges(changes:SimpleChanges){if(changes['accessToken']||changes['tenantId']){this.closeSocket();this.stopped=false;if(this.accessToken){void this.load();this.connect();}}}
 ngOnDestroy(){this.stopped=true;this.closeSocket();}
 toggle(){this.open=!this.open;if(this.open)void this.load();}
 async load(){if(!this.accessToken)return;this.loading=true;this.error='';try{const [list,count]=await Promise.all([fetch('/api/notifications?limit=30',{headers:{authorization:'Bearer '+this.accessToken}}),fetch('/api/notifications/unread-count',{headers:{authorization:'Bearer '+this.accessToken}})]);if(!list.ok||!count.ok)throw new Error('Notifications are unavailable');const data=await list.json(),countData=await count.json();this.items=data.notifications??[];this.unread=Number(countData.count)||0;}catch{this.error='Unable to load notifications. Please refresh and try again.';}finally{this.loading=false;}}
 async markRead(item:NotificationItem){if(item.readAt)return;try{const response=await fetch('/api/notifications/'+encodeURIComponent(item.id)+'/read',{method:'PATCH',headers:{authorization:'Bearer '+this.accessToken}});if(!response.ok)throw new Error('Mark read failed');item.readAt=new Date();this.unread=Math.max(0,this.unread-1);}catch{this.error='Could not mark this notification as read.';}}
 async markAll(){try{const r=await fetch('/api/notifications/read-all',{method:'PATCH',headers:{authorization:'Bearer '+this.accessToken}});if(!r.ok)throw new Error('Mark all read failed');this.items=this.items.map(i=>({...i,readAt:i.readAt??new Date()}));this.unread=0;this.error='';}catch{this.error='Could not mark notifications as read.';}}
 openItem(item:NotificationItem){void this.markRead(item);if(item.action?.route){window.location.assign(item.action.route);}else this.open=false;}
 time(value:Date|string){return new Date(value).toLocaleString();}
 async connect(){if(this.stopped||!this.accessToken)return;try{const ticketResponse=await fetch('/api/notifications/realtime-ticket',{method:'POST',headers:{authorization:'Bearer '+this.accessToken}});if(!ticketResponse.ok)throw new Error('Ticket request failed');const data=await ticketResponse.json();if(typeof data.ticket!=='string'||!data.ticket)throw new Error('Ticket missing');const wsUrl=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/realtime?ticket='+encodeURIComponent(data.ticket);const socket=new WebSocket(wsUrl);this.socket=socket;socket.onmessage=(event)=>{try{const message=JSON.parse(event.data);if(message.type==='notification:new'){this.unread+=1;if(this.open)void this.load();}}catch{}};socket.onclose=()=>this.scheduleRetry();socket.onerror=()=>socket.close();}catch{this.scheduleRetry();}}
 scheduleRetry(){if(this.stopped||this.retry)return;this.retry=setTimeout(()=>{this.retry=undefined;void this.connect();},5000);}
 closeSocket(){if(this.retry){clearTimeout(this.retry);this.retry=undefined;}if(this.socket){this.socket.onclose=null;this.socket.close();this.socket=undefined;}}
}