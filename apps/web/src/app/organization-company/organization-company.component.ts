import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeI18nService } from '../i18n/bee-i18n.service';

type CompanyProfile = { legalName:string; taxId:string; email:string; phone:string; website:string; addressLine1:string; addressLine2:string; city:string; region:string; postalCode:string; country:string; industry:string; description:string };
const EMPTY_PROFILE:CompanyProfile={legalName:'',taxId:'',email:'',phone:'',website:'',addressLine1:'',addressLine2:'',city:'',region:'',postalCode:'',country:'',industry:'',description:''};

@Component({selector:'bee-company-profile',standalone:true,imports:[CommonModule,FormsModule],template:`<section class="company-profile">
  <header class="company-profile__head"><div><span class="company-profile__eyebrow">{{t('company.profile')}}</span><h2>{{t('company.details')}}</h2><p>{{t('company.detailsIntro')}}</p></div><span class="company-profile__badge">{{tenantName}}</span></header>
  @if(loading){<p class="company-profile__notice">{{t('company.loading')}}</p>}@else {
  <form (ngSubmit)="save()" class="company-profile__form">
    <article class="company-profile__card"><h3>{{t('company.basic')}}</h3><div class="company-profile__grid">
      <label>{{t('company.name')}}<input [(ngModel)]="companyName" [disabled]="!canEdit" name="companyName" maxlength="120" required /></label><label>{{t('company.legalName')}}<input [(ngModel)]="profile.legalName" [disabled]="!canEdit" name="legalName" maxlength="160" /></label>
      <label>{{t('company.taxId')}}<input [(ngModel)]="profile.taxId" [disabled]="!canEdit" name="taxId" maxlength="80" /></label>
      <label>{{t('company.email')}}<input [(ngModel)]="profile.email" [disabled]="!canEdit" name="email" type="email" maxlength="160" /></label>
      <label>{{t('company.phone')}}<input [(ngModel)]="profile.phone" [disabled]="!canEdit" name="phone" maxlength="60" /></label>
      <label>{{t('company.website')}}<input [(ngModel)]="profile.website" [disabled]="!canEdit" name="website" type="url" maxlength="240" placeholder="https://" /></label>
      <label>{{t('company.industry')}}<input [(ngModel)]="profile.industry" [disabled]="!canEdit" name="industry" maxlength="120" /></label>
    </div><label class="company-profile__wide">{{t('company.description')}}<textarea [(ngModel)]="profile.description" [disabled]="!canEdit" name="description" rows="3" maxlength="1000"></textarea></label></article>
    <article class="company-profile__card"><h3>{{t('company.address')}}</h3><div class="company-profile__grid">
      <label class="company-profile__wide">{{t('company.addressLine1')}}<input [(ngModel)]="profile.addressLine1" [disabled]="!canEdit" name="addressLine1" maxlength="180" /></label>
      <label class="company-profile__wide">{{t('company.addressLine2')}}<input [(ngModel)]="profile.addressLine2" [disabled]="!canEdit" name="addressLine2" maxlength="180" /></label>
      <label>{{t('company.city')}}<input [(ngModel)]="profile.city" [disabled]="!canEdit" name="city" maxlength="120" /></label>
      <label>{{t('company.region')}}<input [(ngModel)]="profile.region" [disabled]="!canEdit" name="region" maxlength="120" /></label>
      <label>{{t('company.postalCode')}}<input [(ngModel)]="profile.postalCode" [disabled]="!canEdit" name="postalCode" maxlength="40" /></label>
      <label>{{t('company.country')}}<input [(ngModel)]="profile.country" [disabled]="!canEdit" name="country" maxlength="120" /></label>
    </div></article>
    @if(error){<p class="company-profile__error">{{error}}</p>}@if(saved){<p class="company-profile__success">{{t('company.saved')}}</p>}
    <footer class="company-profile__actions"><span>{{canEdit?t('company.note'):t('company.readOnly')}}</span>@if(canEdit){<button type="submit" [disabled]="saving">{{saving?t('company.saving'):t('company.save')}}</button>}</footer>
  </form>}
</section>`,
styles:[`:host{display:block;width:100%;color:inherit}.company-profile{display:grid;gap:16px}.company-profile__head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.company-profile__eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;font-weight:700}.company-profile__head h2{font-size:18px;margin:7px 0}.company-profile__head p{font-size:12px;opacity:.65;margin:0;line-height:1.5}.company-profile__badge{border:1px solid var(--border,#8885);border-radius:999px;padding:7px 12px;font-size:11px;opacity:.7;white-space:nowrap}.company-profile__form{display:grid;gap:14px}.company-profile__card{padding:20px;border:1px solid var(--border,#8885);border-radius:16px;background:var(--panel,#8881);min-width:0}.company-profile__card h3{font-size:15px;margin:0 0 16px}.company-profile__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.company-profile__grid label,.company-profile__wide{display:grid;gap:6px;font-size:12px;font-weight:600;min-width:0}.company-profile__wide{margin-top:14px}.company-profile input,.company-profile textarea{box-sizing:border-box;width:100%;min-height:40px;padding:10px 12px;border:1px solid var(--border,#8885);border-radius:9px;background:var(--panel,#8881);color:inherit;font:inherit;font-size:12px;outline:none}.company-profile textarea{resize:vertical;min-height:80px}.company-profile input:focus,.company-profile textarea:focus{border-color:var(--purple,#8c72ff);box-shadow:0 0 0 2px color-mix(in srgb,var(--purple,#8c72ff) 18%,transparent)}.company-profile__actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.company-profile__actions span{font-size:11px;opacity:.6;line-height:1.5}.company-profile__actions button{border:0;border-radius:9px;background:var(--purple,#777);color:white;padding:11px 17px;font-size:12px;font-weight:600;cursor:pointer}.company-profile__actions button:disabled{opacity:.55;cursor:wait}.company-profile__notice,.company-profile__error,.company-profile__success{font-size:12px;line-height:1.5}.company-profile__error{color:#d65c5c}.company-profile__success{color:#26996c}@media(max-width:700px){.company-profile__head{flex-direction:column}.company-profile__grid{grid-template-columns:1fr}.company-profile__wide{grid-column:auto}.company-profile__actions{align-items:flex-start;flex-direction:column}}`]
})
export class CompanyProfileComponent implements OnChanges{
 @Input() tenantId='';@Input() role='';@Input() accessToken='';@Input() tenantName='Company';
 companyName='';profile:CompanyProfile={...EMPTY_PROFILE};loading=false;saving=false;error='';saved=false;private loadKey='';
 constructor(private i18n:BeeI18nService){}
 get canEdit(){return ['owner','admin','super_admin'].includes((this.role||'').toLowerCase());}
 t(key:string){return this.i18n.t('organization:'+key);}
 ngOnChanges(){const key=this.tenantId+':'+this.accessToken;if(!key||key===this.loadKey)return;this.loadKey=key;void this.load();}
 async load(){this.loading=true;this.error='';try{const r=await fetch('/api/companies/'+encodeURIComponent(this.tenantId)+'/profile',{credentials:'same-origin',headers:{authorization:'Bearer '+this.accessToken}});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load company profile');this.companyName=data.name||this.tenantName;this.profile={...EMPTY_PROFILE,...data.profile};}catch(e){this.error=e instanceof Error?e.message:'Could not load company profile';}finally{this.loading=false;}}
 async save(){if(this.saving)return;this.saving=true;this.error='';this.saved=false;try{const r=await fetch('/api/companies/'+encodeURIComponent(this.tenantId)+'/profile',{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json',authorization:'Bearer '+this.accessToken},body:JSON.stringify({name:this.companyName,profile:this.profile})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not save company profile');this.companyName=data.name||this.companyName;this.profile={...EMPTY_PROFILE,...data.profile};this.saved=true;}catch(e){this.error=e instanceof Error?e.message:'Could not save company profile';}finally{this.saving=false;}}
}
