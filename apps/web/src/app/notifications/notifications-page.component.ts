import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
type N={id:string;title:string;message:string;category:string;priority:string;readAt?:string|null;createdAt:string;action?:{label:string;route:string}};
@Component({selector:'bee-notifications-page',standalone:true,imports:[CommonModule],template: `<section class="np"><header><div><small>WORKSPACE ACTIVITY</small><h1>Notifications</h1><p>Updates and alerts from your workspace.</p></div><button (click)="markAll()" [disabled]="unread===0">✓ Mark all read</button></header><div class="stats"><div><small>Updates</small><strong>{{items.length}}</strong></div><div><small>Unread</small><strong>{{unread}}</strong></div><div><small>High priority</small><strong>{{high}}</strong></div></div><nav><button [class.active]="filter==='all'" (click)="filter='all'">All Notifications</button><button [class.active]="filter==='unread'" (click)="filter='unread'">Unread Notifications</button><button [class.active]="filter==='security'" (click)="filter='security'">Security</button><button class="refresh" (click)="load()">↻ Refresh</button></nav>@if(error){<p class="error">{{error}}</p>}@if(busy){<p class="empty">Loading…</p>}@else if(filtered.length===0){<div class="empty"><b>✦</b><h3>All caught up</h3><p>New activity will show up here.</p></div>}@else{@for(n of filtered;track n.id){<article [class.unread]="!n.readAt"><span class="symbol">{{n.category==='security'?'⌑':n.category==='plugins'?'▣':'✦'}}</span><div class="body"><small>{{n.category}} · {{date(n.createdAt)}}</small><h3>{{n.title}}</h3><p>{{n.message}}</p>@if(n.action){<a [href]="n.action.route">{{n.action.label}} →</a>}</div><div class="actions">@if(!n.readAt){<button (click)="markRead(n)" title="Mark read">✓</button>}<button (click)="remove(n)" title="Delete">×</button></div></article>}}</section>`,
styles:[`
:host{display:block;width:100%;min-width:0;color:inherit}
.np{display:block;width:100%;max-width:none;min-width:0;box-sizing:border-box;color:inherit}
.np header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin:4px 0 25px}
.np header>div{min-width:0}
.np header small{font-size:10px;letter-spacing:.16em;opacity:.58;font-weight:700}
.np h1{font-size:clamp(26px,3vw,36px);margin:9px 0 6px;font-weight:600;letter-spacing:-.02em}
.np header p{margin:0;opacity:.7;max-width:720px;font-size:12px;line-height:1.6}
.np header button{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex:none;background:transparent;border:1px solid var(--border,#8885);border-radius:9px;padding:9px 12px;color:inherit;font:600 11px Arial,sans-serif;cursor:pointer}
.np header button:disabled{opacity:.4;cursor:not-allowed}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0 0 16px}
.stats div{min-width:0;padding:18px 21px;border:1px solid var(--border,#8885);border-radius:16px;background:var(--panel,#8881)}
.stats small{display:block;font-size:11px;line-height:1.5;opacity:.65}
.stats strong{display:block;margin-top:7px;font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-.02em}
.np nav{display:flex;align-items:center;gap:4px;padding:0 14px;margin:0 0 14px;border-bottom:1px solid var(--border,#8885);overflow-x:auto;overflow-y:hidden}
.np nav button{flex:none;display:flex;align-items:center;justify-content:center;padding:12px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:600 11px Arial,sans-serif;cursor:pointer;white-space:nowrap;opacity:.62}
.np nav button.active{border-bottom-color:var(--purple,#8c72ff);opacity:1;color:var(--purple,#8c72ff)}
.np nav .refresh{margin-left:auto}
.np article{display:flex;align-items:flex-start;gap:13px;margin:0 0 10px;padding:17px 18px;border:1px solid var(--border,#8885);border-radius:13px;background:var(--panel,#8881)}
.np article.unread{border-color:var(--purple,#8c72ff);background:color-mix(in srgb,var(--purple,#8c72ff) 6%,var(--panel,#8881))}
.symbol{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:var(--purple,#777);color:white;font-size:18px}
.body{flex:1;min-width:0}
.body small{font-size:10px;letter-spacing:.02em;opacity:.58}
.body h3{margin:6px 0 5px;font-size:14px;line-height:1.4;font-weight:600}
.body p{margin:0;opacity:.68;font-size:12px;line-height:1.55}
.body a{display:inline-block;margin-top:9px;color:var(--purple,#8c72ff);text-decoration:none;font-size:11px;font-weight:600}
.actions{display:flex;gap:5px;flex:none}
.actions button{display:grid;place-items:center;border:1px solid var(--border,#8885);background:transparent;color:inherit;border-radius:8px;width:30px;height:30px;cursor:pointer;opacity:.65}
.actions button:hover{opacity:1;border-color:var(--purple,#8c72ff)}
.empty{padding:42px 20px;text-align:center;border:1px solid var(--border,#8885);border-radius:16px;background:var(--panel,#8881);color:inherit;opacity:.7}
.empty b{font-size:28px;color:var(--purple,#8c72ff)}
.empty h3{margin:9px 0 5px;font-size:15px;font-weight:600}
.empty p{margin:0;font-size:12px;line-height:1.55}
.error{padding:12px 14px;border:1px solid #dc262633;border-radius:10px;color:#dc6262;font-size:12px}
@media(max-width:760px){.np header{flex-direction:column;align-items:flex-start}.stats{gap:8px}.stats div{padding:14px}.np nav{padding-inline:4px}.np nav .refresh{margin-left:0}.np article{gap:9px;padding:14px 12px}.symbol{flex-basis:36px;width:36px;height:36px}}
`]
})
export class BeeNotificationsPageComponent implements OnChanges{
 @Input() accessToken='';@Input() tenantId='';items:N[]=[];filter='all';busy=false;error='';
 get unread(){return this.items.filter(n=>!n.readAt).length}
 get high(){return this.items.filter(n=>n.priority==='high'&&!n.readAt).length}
 get filtered(){return this.items.filter(n=>this.filter==='all'||(this.filter==='unread'?!n.readAt:n.category==='security'))}
 ngOnChanges(){if(this.accessToken)this.load()}
 private async req(path:string,method='GET'){const r=await fetch('/api'+path,{method,headers:{Authorization:'Bearer '+this.accessToken}});if(!r.ok)throw new Error('Request failed '+r.status);return r.json()}
 async load(){this.busy=true;this.error='';try{const d=await this.req('/notifications?limit=100');this.items=d.notifications||[]}catch(e:any){this.error=e?.message||'Unable to load'}finally{this.busy=false}}
 async markRead(n:N){try{await this.req('/notifications/'+encodeURIComponent(n.id)+'/read','PATCH');n.readAt=new Date().toISOString()}catch{this.error='Could not mark read'}}
 async markAll(){try{await this.req('/notifications/read-all','PATCH');const now=new Date().toISOString();this.items.forEach(n=>{if(!n.readAt)n.readAt=now})}catch{this.error='Could not mark all read'}}
 async remove(n:N){try{await this.req('/notifications/'+encodeURIComponent(n.id),'DELETE');this.items=this.items.filter(x=>x.id!==n.id)}catch{this.error='Could not delete'}}
 date(v:string){return new Date(v).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}
}