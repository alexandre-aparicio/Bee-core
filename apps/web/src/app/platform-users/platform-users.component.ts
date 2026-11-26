import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BeeIconComponent } from '../core/icons/bee-icon.component';

type PlatformUser = {
  id:string; userId?:string; name?:string; email:string; role?:string; status?:string;
  tenantId?:string|null; tenantName?:string|null; companyName?:string|null; createdAt?:string;
};
type PlatformTenant = {id:string;name:string};

@Component({
  selector:'bee-platform-users',
  standalone:true,
  imports:[CommonModule,FormsModule,BeeIconComponent],
  template:`
    <section class="platform-users">
      <header class="settings-page organization-page platform-users__page-head">
        <div class="settings-page__eyebrow">Settings / Platform users</div>
        <h1>Platform users</h1>
        <p class="settings-page__intro">Manage user accounts and their access across all tenants.</p>
      </header>

      <section class="platform-users__identity bee-dashboard-card" aria-labelledby="platform-users-title">
        <div class="platform-users__identity-heading">
          <span class="platform-users__identity-mark" aria-hidden="true"><bee-icon name="users" size="24px"></bee-icon></span>
          <div><h2 id="platform-users-title">Platform users</h2><p>Global directory · Manage accounts and tenant access</p></div>
        </div>
      </section>

      <div class="plugin-settings__toolbar">
        <div class="plugin-settings__toolbar-filters">
          <div class="plugin-settings__search">
            <span aria-hidden="true">⌕</span>
            <input type="search" [(ngModel)]="search" placeholder="Search users…" aria-label="Search users">
            <button *ngIf="search" type="button" (click)="search=''" aria-label="Clear search">×</button>
          </div>
          <select class="platform-users__tenant-filter" [(ngModel)]="tenantFilter" aria-label="Filter by tenant">
            <option value="">All tenants</option>
            <option *ngFor="let tenant of tenants" [value]="tenant.id">{{tenant.name}}</option>
            <option value="__unassigned">No tenant</option>
          </select>
        </div>
        <div class="plugin-settings__toolbar-actions">
          <div class="plugin-settings__views" role="group" aria-label="User display mode">
            <button type="button" [class.is-active]="viewMode==='cards'" [attr.aria-pressed]="viewMode==='cards'" (click)="viewMode='cards'" aria-label="Card view" title="Card view">▦</button>
            <button type="button" [class.is-active]="viewMode==='list'" [attr.aria-pressed]="viewMode==='list'" (click)="viewMode='list'" aria-label="Table view" title="Table view">☷</button>
          </div>
          <button type="button" class="plugin-settings__upload" (click)="openCreate()">＋ New user</button>
        </div>
      </div>

      <p *ngIf="error" class="platform-users__message platform-users__message--error bee-status--danger" role="alert">{{error}}</p>
      <p *ngIf="success" class="platform-users__message platform-users__message--success bee-status--success" role="status">{{success}}</p>
      <div *ngIf="loading" class="platform-users__empty">Loading users…</div>
      <div *ngIf="!loading && !error && !filteredUsers.length" class="platform-users__empty">
        {{users.length ? 'No users match these filters.' : 'No platform users found.'}}
      </div>

      <div *ngIf="!loading && filteredUsers.length && viewMode==='cards'" class="platform-users__cards">
        <article class="platform-users__user-card" *ngFor="let user of filteredUsers; trackBy: trackUser">
          <div class="platform-users__user-top">
            <span class="platform-users__avatar">{{initials(user)}}</span>
            <span class="platform-users__status" [class.is-inactive]="user.status && user.status!=='active'">{{user.status || 'Active'}}</span>
          </div>
          <h3>{{user.name || user.email}}</h3>
          <p class="platform-users__email">{{user.email}}</p>
          <div class="platform-users__user-meta">
            <span>{{user.role || 'User'}}</span>
            <span>{{tenantName(user)}}</span>
          </div>
        </article>
      </div>

      <div *ngIf="!loading && filteredUsers.length && viewMode==='list'" class="platform-users__table-wrap">
        <table class="platform-users__table">
          <thead><tr><th>User</th><th>Tenant</th><th>Role</th><th>Status</th></tr></thead>
          <tbody><tr *ngFor="let user of filteredUsers; trackBy: trackUser">
            <td><strong>{{user.name || user.email}}</strong><small>{{user.email}}</small></td>
            <td>{{tenantName(user)}}</td><td>{{user.role || 'User'}}</td>
            <td><span class="platform-users__status" [class.is-inactive]="user.status && user.status!=='active'">{{user.status || 'Active'}}</span></td>
          </tr></tbody>
        </table>
      </div>

      <div class="platform-users__modal-backdrop" *ngIf="createModalOpen" (click)="closeCreate()">
        <section class="platform-users__modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-create-title" (click)="$event.stopPropagation()">
          <header class="platform-users__modal-head">
            <div><span class="platform-users__eyebrow">USER MANAGEMENT</span><h2 id="platform-user-create-title">Create a user</h2><p>Create a platform account and assign its initial tenant access.</p></div>
            <button type="button" aria-label="Close dialog" (click)="closeCreate()">×</button>
          </header>
          <form class="platform-users__form" (ngSubmit)="createUser()">
            <label>Full name<input name="name" [(ngModel)]="form.name" required maxlength="120" placeholder="User name"></label>
            <label>Email address<input name="email" type="email" [(ngModel)]="form.email" required maxlength="254" placeholder="name@company.com"></label>
            <label>Tenant<select name="tenantId" [(ngModel)]="form.tenantId"><option value="">No tenant / platform only</option><option *ngFor="let tenant of tenants" [value]="tenant.id">{{tenant.name}}</option></select></label>
            <label>Role<select name="role" [(ngModel)]="form.role"><option value="employee">Employee</option><option value="manager">Manager</option><option value="admin">Admin</option><option value="owner">Owner</option><option value="superadmin">Superadmin</option></select></label>
            <label>Temporary password<input name="password" type="password" [(ngModel)]="form.password" minlength="12" autocomplete="new-password" placeholder="At least 12 characters"></label>
            <p class="platform-users__form-error" *ngIf="modalError" role="alert">{{modalError}}</p>
            <footer class="platform-users__modal-actions"><button type="button" class="platform-users__cancel" (click)="closeCreate()" [disabled]="saving">Cancel</button><button type="submit" [disabled]="saving">{{saving?'Creating…':'Create user'}}</button></footer>
          </form>
        </section>
      </div>
    </section>
  `,
  styles:[`
    :host{display:block;width:100%;min-width:0;color:inherit}
    .platform-users{display:grid;gap:18px;width:100%;min-width:0}
    .platform-users__page-head{width:100%;max-width:none;margin:0 0 2px}
    .platform-users__identity{width:100%;min-width:0;padding:0;border:1px solid var(--bee-border);border-radius:14px;background:var(--bee-surface);overflow:hidden}
    .platform-users__identity-heading{display:flex;align-items:center;gap:14px;padding:18px 20px}
    .platform-users__identity-mark{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;border:1px solid color-mix(in srgb,var(--bee-accent) 32%,var(--bee-border));border-radius:12px;background:color-mix(in srgb,var(--bee-accent) 10%,var(--bee-surface));color:var(--bee-accent)}
    .platform-users__identity-heading h2{margin:2px 0 5px;font-size:17px;font-weight:600}
    .platform-users__identity-heading p{margin:0;color:var(--bee-text-muted);font-size:12px;line-height:1.5}
    .plugin-settings__toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 2px;min-width:0}
    .plugin-settings__toolbar-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,.7fr);align-items:center;gap:9px;flex:1;min-width:0}
    .plugin-settings__toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:0 0 auto}
    .plugin-settings__search{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:38px;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface);color:var(--bee-text-muted);box-sizing:border-box}
    .plugin-settings__search>span{font-size:20px;opacity:.65}
    .plugin-settings__search input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:inherit;font-size:12px}
    .plugin-settings__search input::placeholder{color:inherit;opacity:.48}
    .plugin-settings__search button{border:0;background:transparent;color:inherit;font-size:16px;cursor:pointer}
    .plugin-settings__search:focus-within{border-color:var(--bee-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--bee-accent) 20%,transparent)}
    .platform-users__tenant-filter{height:38px;min-width:0;padding:0 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-surface);color:inherit;font:inherit;font-size:12px}
    .platform-users__tenant-filter:focus{outline:2px solid color-mix(in srgb,var(--bee-accent) 25%,transparent);border-color:var(--bee-accent)}
    .plugin-settings__views{display:flex;align-items:center;gap:5px;padding:5px;border:0;border-radius:10px;background:transparent;flex:0 0 auto}
    .plugin-settings__views button{display:grid;place-items:center;width:34px;height:32px;border:1px solid var(--bee-border);border-radius:7px;background:transparent;color:var(--bee-text-muted);font:inherit;font-size:17px;cursor:pointer}
    .plugin-settings__views button.is-active{border-color:var(--bee-accent);background:var(--bee-accent);color:var(--bee-action-text)}
    .plugin-settings__upload{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:8px 13px;border:1px solid var(--bee-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
    .plugin-settings__upload:hover{background:color-mix(in srgb,var(--bee-accent) 10%,transparent);border-color:color-mix(in srgb,var(--bee-accent) 55%,var(--bee-border))}
    .platform-users__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:14px}
    .platform-users__user-card{display:grid;gap:9px;min-width:0;padding:17px;border:1px solid var(--bee-border);border-radius:13px;background:var(--bee-surface)}
    .platform-users__user-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .platform-users__avatar{display:grid;place-items:center;width:42px;height:42px;border:1px solid color-mix(in srgb,var(--bee-accent) 30%,var(--bee-border));border-radius:12px;background:color-mix(in srgb,var(--bee-accent) 10%,var(--bee-surface));color:var(--bee-accent);font-size:14px;font-weight:700}
    .platform-users__user-card h3{margin:5px 0 0;font-size:14px;overflow-wrap:anywhere}
    .platform-users__email{margin:0;color:var(--bee-text-muted);font-size:11px;overflow-wrap:anywhere}
    .platform-users__user-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:6px}
    .platform-users__user-meta span{padding:5px 8px;border:1px solid var(--bee-border);border-radius:999px;color:var(--bee-text-muted);font-size:10px}
    .platform-users__status{display:inline-flex;padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--bee-status-success) 10%,transparent);color:var(--bee-status-success);font-size:10px;text-transform:capitalize;white-space:nowrap}
    .platform-users__status.is-inactive{background:color-mix(in srgb,var(--bee-status-warning) 10%,transparent);color:var(--bee-status-warning)}
    .platform-users__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--bee-border);border-radius:12px;background:var(--bee-surface)}
    .platform-users__table{width:100%;border-collapse:collapse;text-align:left}
    .platform-users__table th{padding:12px;color:var(--bee-text-muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--bee-border)}
    .platform-users__table td{padding:13px 12px;border-bottom:1px solid var(--bee-border);font-size:11px}
    .platform-users__table tr:last-child td{border-bottom:0}
    .platform-users__table td strong,.platform-users__table td small{display:block}
    .platform-users__table td small{margin-top:3px;color:var(--bee-text-muted);font-size:10px}
    .platform-users__empty{padding:32px;text-align:center;border:1px dashed var(--bee-border);border-radius:12px;color:var(--bee-text-muted);font-size:12px}
    .platform-users__message{margin:0;padding:10px 12px;border-radius:8px;font-size:11px}
    .platform-users__message--error{background:color-mix(in srgb,var(--bee-status-danger) 9%,transparent)}
    .platform-users__message--success{background:color-mix(in srgb,var(--bee-status-success) 9%,transparent)}
    .platform-users__modal-backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,var(--bee-overlay-strong) 100%,transparent);backdrop-filter:blur(8px)}
    .platform-users__modal{width:min(100%,520px);max-height:min(90vh,760px);overflow:auto;padding:23px;border:1px solid var(--bee-border);border-radius:17px;background:var(--bee-surface);color:inherit;box-shadow:0 28px 90px color-mix(in srgb,var(--bee-overlay-strong) 65%,transparent)}
    .platform-users__modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:20px}
    .platform-users__eyebrow{color:var(--bee-text-muted);font-size:9px;letter-spacing:.12em}
    .platform-users__modal-head h2{margin:7px 0 4px;font:600 21px 'Space Grotesk',sans-serif}
    .platform-users__modal-head p{margin:0;color:var(--bee-text-muted);font-size:11px}
    .platform-users__modal-head>button{width:30px;height:30px;border:1px solid var(--bee-border);border-radius:8px;background:transparent;color:inherit;font-size:20px;cursor:pointer}
    .platform-users__form{display:grid;gap:10px}
    .platform-users__form label{display:grid;gap:6px;margin-top:3px;color:var(--bee-text-muted);font-size:11px}
    .platform-users__form input,.platform-users__form select{width:100%;box-sizing:border-box;min-height:39px;padding:9px 11px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-bg);color:inherit;font:inherit;font-size:12px}
    .platform-users__form input:focus,.platform-users__form select:focus{outline:0;border-color:var(--bee-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--bee-accent) 13%,transparent)}
    .platform-users__form-error{margin:0;color:var(--bee-status-danger);font-size:11px}
    .platform-users__modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
    .platform-users__modal-actions button{border:1px solid var(--bee-accent);border-radius:8px;padding:10px 14px;background:var(--bee-accent);color:var(--bee-accent-text);font-size:11px;font-weight:650;cursor:pointer}
    .platform-users__modal-actions .platform-users__cancel{border-color:var(--bee-border);background:transparent;color:inherit}
    .platform-users__modal-actions button:disabled{opacity:.55;cursor:wait}
    @media(max-width:760px){.plugin-settings__toolbar{align-items:stretch;flex-direction:column}.plugin-settings__toolbar-filters{grid-template-columns:1fr}.plugin-settings__toolbar-actions{justify-content:flex-end}.platform-users__identity-heading{padding:15px}.platform-users__modal-backdrop{padding:10px}.platform-users__modal{padding:16px}}
  `]
})
export class PlatformUsersComponent implements OnInit {
  @Input() accessToken='';
  private readonly api='/api';
  users:PlatformUser[]=[];tenants:PlatformTenant[]=[];
  loading=false;saving=false;error='';success='';search='';tenantFilter='';viewMode:'cards'|'list'='cards';createModalOpen=false;modalError='';
  form={name:'',email:'',tenantId:'',role:'employee',password:''};

  ngOnInit():void{void this.load();}
  private headers():HeadersInit{return {'content-type':'application/json'};}
  private authHeaders():HeadersInit{return {...this.headers(),...(this.accessToken?{authorization:'Bearer '+this.accessToken}:{})};}
  get filteredUsers():PlatformUser[]{
    const query=this.search.trim().toLocaleLowerCase();
    return this.users.filter(user=>{
      const matchesTenant=!this.tenantFilter||(this.tenantFilter==='__unassigned'?!user.tenantId:user.tenantId===this.tenantFilter);
      const matchesQuery=!query||[user.name||'',user.email,user.role||'',user.status||'',user.tenantName||'',user.companyName||''].join(' ').toLocaleLowerCase().includes(query);
      return matchesTenant&&matchesQuery;
    });
  }
  trackUser(_index:number,user:PlatformUser):string{return user.id||user.userId||user.email;}
  initials(user:PlatformUser):string{return (user.name||user.email||'?').trim().split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('')||'?';}
  tenantName(user:PlatformUser):string{return user.tenantName||user.companyName||this.tenants.find(item=>item.id===user.tenantId)?.name||'No tenant';}
  openCreate():void{this.modalError='';this.createModalOpen=true;}
  closeCreate():void{if(this.saving)return;this.createModalOpen=false;this.modalError='';}
  @HostListener('document:keydown.escape') onEscape():void{if(this.createModalOpen)this.closeCreate();}
  async load():Promise<void>{
    this.loading=true;this.error='';
    try{
      const [usersResponse,tenantsResponse]=await Promise.all([
        fetch(this.api+'/platform/users',{headers:this.authHeaders()}),
        fetch(this.api+'/platform/companies',{headers:this.authHeaders()})
      ]);
      const [usersData,tenantsData]=await Promise.all([usersResponse.json(),tenantsResponse.json()]);
      if(!usersResponse.ok)throw new Error(usersData.error||'Unable to load platform users');
      if(!tenantsResponse.ok)throw new Error(tenantsData.error||'Unable to load tenants');
      this.users=Array.isArray(usersData)?usersData:(usersData.users||[]);
      this.tenants=Array.isArray(tenantsData.companies)?tenantsData.companies:(tenantsData.tenants||[]);
    }catch(error){this.error=error instanceof Error?error.message:'Unable to load platform users';}
    finally{this.loading=false;}
  }
  async createUser():Promise<void>{
    if(this.saving)return;this.saving=true;this.modalError='';this.error='';this.success='';
    try{
      const payload={name:this.form.name.trim(),email:this.form.email.trim(),tenantId:this.form.tenantId||undefined,role:this.form.role,password:this.form.password||undefined};
      const response=await fetch(this.api+'/platform/users',{method:'POST',headers:this.authHeaders(),body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Unable to create user');
      this.success='User created successfully.';this.createModalOpen=false;this.form={name:'',email:'',tenantId:'',role:'employee',password:''};await this.load();
    }catch(error){this.modalError=error instanceof Error?error.message:'Unable to create user';}
    finally{this.saving=false;}
  }
}
