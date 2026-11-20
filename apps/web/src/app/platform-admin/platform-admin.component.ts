import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type PlatformCompany={id:string;name:string;slug?:string|null;status:'active'|'suspended';createdAt:string;membersCount?:number};

@Component({
 selector:'bee-platform-admin',
 standalone:true,
 imports:[CommonModule,FormsModule],
 template:`<section class="panel platform-admin"><div class="panel-heading"><div><h2>Platform administration</h2><p>Global company controls</p></div><button type="button" (click)="load()">Refresh</button></div><div class="platform-admin-grid"><form class="platform-admin-form" (ngSubmit)="create()"><h3>Create company</h3><label>Company name</label><input name="companyName" [(ngModel)]="name" required minlength="2" maxlength="120" placeholder="Dragchart"><label>Public subdomain slug</label><input name="companySlug" [(ngModel)]="slug" pattern="[a-z0-9-]+" maxlength="48" placeholder="dragchart"><small>Public address: {{slug || "[company-slug]"}}.beecore.beeprojects.net</small><label>Owner email</label><input name="ownerEmail" type="email" [(ngModel)]="ownerEmail" required placeholder="owner@company.com"><label>Initial password (new user only)</label><input name="ownerPassword" type="password" [(ngModel)]="ownerPassword" minlength="12" placeholder="At least 12 characters"><button type="submit" [disabled]="busy">Create company</button></form><div class="platform-admin-companies"><h3>Companies <span>{{companies.length}}</span></h3>@if(error){<p class="platform-admin-error">{{error}}</p>}@if(success){<p class="platform-admin-success">{{success}}</p>}@for(c of companies;track c.id){<article class="platform-company"><div><strong>{{c.name}}</strong><small>{{c.slug || "no-slug"}}.beecore.beeprojects.net · {{c.membersCount??0}} members · {{c.status}}</small></div><button type="button" [disabled]="busy" (click)="toggle(c)">{{c.status==='active'?'Suspend':'Activate'}}</button></article>}@empty {<p>No companies yet.</p>}</div></div></section>`
})
export class PlatformAdminComponent implements OnInit {
 @Input() token='';
 companies:PlatformCompany[]=[];name='';slug='';ownerEmail='';ownerPassword='';busy=false;error='';success='';
 ngOnInit(){void this.load();}
 private headers(){return {authorization:'Bearer '+this.token};}
 async load(){this.error='';try{const r=await fetch('/api/platform/companies',{headers:this.headers()});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to list companies');this.companies=d.companies??[];}catch(e){this.error=e instanceof Error?e.message:'Request failed';}}
 async create(){this.busy=true;this.error='';this.success='';try{const r=await fetch('/api/platform/companies',{method:'POST',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({name:this.name,slug:this.slug||undefined,ownerEmail:this.ownerEmail,ownerPassword:this.ownerPassword||undefined})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Creation failed');this.success='Company created successfully.';this.name='';this.slug='';this.ownerEmail='';this.ownerPassword='';await this.load();}catch(e){this.error=e instanceof Error?e.message:'Request failed';}finally{this.busy=false;}}
 async toggle(c:PlatformCompany){this.busy=true;this.error='';try{const r=await fetch('/api/platform/companies/'+encodeURIComponent(c.id),{method:'PATCH',headers:{...this.headers(),'content-type':'application/json'},body:JSON.stringify({status:c.status==='active'?'suspended':'active'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Status change failed');await this.load();}catch(e){this.error=e instanceof Error?e.message:'Request failed';}finally{this.busy=false;}}
}
