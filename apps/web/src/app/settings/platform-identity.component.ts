import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

type IdentityTab = 'brand' | 'assets' | 'seo';
type PlatformIdentity = {
  brand: { platformName:string; pageTitle:string; tagline:string; description:string; legalName:string; websiteUrl:string; contactEmail:string; copyright:string };
  assets: { primaryLogoUrl:string; secondaryLogoUrl:string; brandMarkUrl:string; faviconUrl:string; appleTouchIconUrl:string; socialImageUrl:string; loginLogoUrl:string };
  seo: { title:string; description:string; keywords:string[]; canonicalUrl:string; robotsIndex:boolean; robotsFollow:boolean; openGraphTitle:string; openGraphDescription:string; openGraphImageUrl:string; twitterCard:'summary'|'summary_large_image'; twitterTitle:string; twitterDescription:string; twitterImageUrl:string };
};

const EMPTY_IDENTITY: PlatformIdentity = {
  brand:{platformName:'Bee-Core',pageTitle:'Bee-Core',tagline:'All Is a Plugin',description:'',legalName:'',websiteUrl:'',contactEmail:'',copyright:''},
  assets:{primaryLogoUrl:'',secondaryLogoUrl:'',brandMarkUrl:'',faviconUrl:'',appleTouchIconUrl:'',socialImageUrl:'',loginLogoUrl:''},
  seo:{title:'',description:'',keywords:[],canonicalUrl:'',robotsIndex:true,robotsFollow:true,openGraphTitle:'',openGraphDescription:'',openGraphImageUrl:'',twitterCard:'summary_large_image',twitterTitle:'',twitterDescription:'',twitterImageUrl:''}
};

@Component({
  selector:'bee-platform-identity',
  standalone:true,
  imports:[CommonModule,FormsModule],
  template:`
    <section class="identity bee-dashboard-card">
      <div class="identity__heading">
        <span class="identity__icon">◈</span><div class="identity__heading-content"><h2>Platform Identity</h2><p><strong>Brand & public presence</strong> · Manage the platform information, visual assets and metadata used by public pages.</p></div>
        <span class="identity__scope">{{editable ? 'Global settings' : 'Public identity'}}</span>
      </div>
      <nav class="identity__tabs" aria-label="Platform identity sections">
        <button type="button" [class.is-active]="tab==='brand'" [attr.aria-selected]="tab==='brand'" (click)="tab='brand'"><span>01</span> Brand information</button>
        <button type="button" [class.is-active]="tab==='assets'" [attr.aria-selected]="tab==='assets'" (click)="tab='assets'"><span>02</span> Brand assets</button>
        <button type="button" [class.is-active]="tab==='seo'" [attr.aria-selected]="tab==='seo'" (click)="tab='seo'"><span>03</span> SEO & social</button>
      </nav>

      @if(loading){<div class="identity__message">Loading platform identity…</div>}
      @else if(error){<div class="identity__message identity__message--error bee-status--danger">{{error}}</div>}
      @else {
        @if(tab==='brand'){
          <div class="identity__panel">
            <div class="identity__section-title"><div><h3>Brand information</h3><p>The default identity shown across the public platform.</p></div></div>
            <div class="identity__grid identity__brand-grid">
              <label>Platform name<input name="platformName" [(ngModel)]="data.brand.platformName" [disabled]="!editable" maxlength="120" placeholder="Bee-Core"></label>
              <label>Page title<input name="pageTitle" [(ngModel)]="data.brand.pageTitle" [disabled]="!editable" maxlength="180" placeholder="Bee-Core · All Is a Plugin"></label>
              <label class="identity__wide">Tagline<input name="tagline" [(ngModel)]="data.brand.tagline" [disabled]="!editable" maxlength="180" placeholder="A short phrase that defines the platform"></label>
              <label class="identity__wide">Platform description<textarea name="description" [(ngModel)]="data.brand.description" [disabled]="!editable" rows="3" maxlength="1000" placeholder="Describe what the platform offers and who it is for."></textarea><small>{{data.brand.description.length}} / 1000</small></label>
              <label>Legal company name<input name="legalName" [(ngModel)]="data.brand.legalName" [disabled]="!editable" maxlength="180" placeholder="Registered company name"></label>
              <label>Public contact email<input name="contactEmail" type="email" [(ngModel)]="data.brand.contactEmail" [disabled]="!editable" maxlength="254" placeholder="hello@example.com"></label>
              <label class="identity__wide">Primary website URL<input name="websiteUrl" type="url" [(ngModel)]="data.brand.websiteUrl" [disabled]="!editable" placeholder="https://example.com"></label>
              <label class="identity__wide">Copyright notice<input name="copyright" [(ngModel)]="data.brand.copyright" [disabled]="!editable" maxlength="180" placeholder="© 2026 Company name"></label>
            </div>
          </div>
        }
        @if(tab==='assets'){
          <div class="identity__panel">
            <div class="identity__section-title"><div><h3>Brand assets</h3><p>Provide public HTTPS URLs for the image files. Asset uploads can be connected to the Files service in a later step.</p></div></div>
            <div class="identity__asset-grid">
              @for(asset of assetFields;track asset.key){
                <label class="identity__asset">
                  <span>{{asset.label}}</span><small>{{asset.hint}}</small>
                  <input [name]="asset.key" type="url" [(ngModel)]="data.assets[asset.key]" [disabled]="!editable" placeholder="https://cdn.example.com/asset.png">
                  @if(data.assets[asset.key]){<div class="identity__asset-preview"><img [src]="data.assets[asset.key]" [alt]="asset.label + ' preview'" (error)="failedPreviews[asset.key]=true" (load)="failedPreviews[asset.key]=false"><span [hidden]="!failedPreviews[asset.key]">Preview unavailable</span></div>}
                </label>
              }
            </div>
          </div>
        }
        @if(tab==='seo'){
          <div class="identity__panel">
            <div class="identity__section-title"><div><h3>Search engine metadata</h3><p>Default metadata for public pages. Individual pages may override these values.</p></div></div>
            <div class="identity__grid">
              <label class="identity__wide">SEO title<input name="seoTitle" [(ngModel)]="data.seo.title" [disabled]="!editable" maxlength="180" placeholder="Use the page title when empty"></label>
              <label class="identity__wide">Meta description<textarea name="seoDescription" [(ngModel)]="data.seo.description" [disabled]="!editable" rows="3" maxlength="320" placeholder="A concise description for search results."></textarea><small>{{data.seo.description.length}} / 320</small></label>
              <label class="identity__wide">Keywords<input name="keywords" [(ngModel)]="keywordsText" [disabled]="!editable" placeholder="platform, plugins, automation"></label>
              <label class="identity__wide">Canonical URL<input name="canonicalUrl" type="url" [(ngModel)]="data.seo.canonicalUrl" [disabled]="!editable" placeholder="https://example.com/"></label>
            </div>
            <div class="identity__robots">
              <label class="identity__toggle"><input type="checkbox" name="robotsIndex" [(ngModel)]="data.seo.robotsIndex" [disabled]="!editable"><span><b>Allow indexing</b><small>Permit search engines to include public pages in results.</small></span></label>
              <label class="identity__toggle"><input type="checkbox" name="robotsFollow" [(ngModel)]="data.seo.robotsFollow" [disabled]="!editable"><span><b>Follow links</b><small>Allow search engines to follow links on public pages.</small></span></label>
            </div>
            <div class="identity__social">
              <h3>Open Graph</h3><p>Preview information for social networks and messaging apps.</p>
              <div class="identity__grid">
                <label>Social title<input name="ogTitle" [(ngModel)]="data.seo.openGraphTitle" [disabled]="!editable" maxlength="180" placeholder="Defaults to SEO title"></label>
                <label>Social image URL<input name="ogImage" type="url" [(ngModel)]="data.seo.openGraphImageUrl" [disabled]="!editable" placeholder="https://…/social-card.png"></label>
                <label class="identity__wide">Social description<textarea name="ogDescription" [(ngModel)]="data.seo.openGraphDescription" [disabled]="!editable" rows="2" maxlength="320" placeholder="Defaults to SEO description"></textarea></label>
              </div>
            </div>
            <div class="identity__social">
              <h3>Twitter / X Cards</h3>
              <div class="identity__grid">
                <label>Card format<select name="twitterCard" [(ngModel)]="data.seo.twitterCard" [disabled]="!editable"><option value="summary_large_image">Large image</option><option value="summary">Summary</option></select></label>
                <label>Card title<input name="twitterTitle" [(ngModel)]="data.seo.twitterTitle" [disabled]="!editable" maxlength="180"></label>
                <label class="identity__wide">Card description<textarea name="twitterDescription" [(ngModel)]="data.seo.twitterDescription" [disabled]="!editable" rows="2" maxlength="320"></textarea></label>
                <label class="identity__wide">Card image URL<input name="twitterImage" type="url" [(ngModel)]="data.seo.twitterImageUrl" [disabled]="!editable" placeholder="https://…/social-card.png"></label>
              </div>
            </div>
            <div class="identity__snippet"><span>SEARCH RESULT PREVIEW</span><b>{{data.seo.title || data.brand.pageTitle || data.brand.platformName}}</b><small>{{data.seo.canonicalUrl || data.brand.websiteUrl || 'https://your-domain.example'}}</small><p>{{data.seo.description || data.brand.description || 'Your public platform description will appear here.'}}</p></div>
          </div>
        }
      }
      <footer class="identity__footer">
        <span class="identity__feedback" [class.is-error]="saveError" [class.bee-status--danger]="saveError" [class.bee-status--success]="!saveError && !!saveMessage">{{saveMessage}}</span>
        @if(editable){<button type="button" class="identity__save" [disabled]="loading || saving" (click)="save()">{{saving?'Saving…':'Save identity'}}</button>}
      </footer>
    </section>
  `,
  styles:[`
    :host{display:block;min-width:0;color:inherit}.identity{min-width:0;padding:0;border:1px solid var(--bee-border);border-radius:14px;background:var(--bee-surface);overflow:hidden}
    .identity__heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:19px 20px 15px}.identity__icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:var(--bee-accent);color:var(--bee-accent-text);font-size:19px}.identity__heading-content{flex:1;min-width:0}.identity__heading h2{font-size:17px;margin:2px 0 5px;font-weight:600;line-height:1.35}.identity__heading p,.identity__section-title p,.identity__social p{font-size:12px;line-height:1.55;opacity:.68;margin:0}.identity__heading p strong{font-weight:600;opacity:1}.identity__scope{border:1px solid var(--bee-border);border-radius:30px;padding:6px 9px;font-size:10px;white-space:nowrap;opacity:.7}
    .identity__tabs{display:flex;gap:4px;padding:0 14px;border-bottom:1px solid var(--bee-border);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:var(--bee-accent) transparent;scrollbar-gutter:stable}.identity__tabs::-webkit-scrollbar{height:3px}.identity__tabs::-webkit-scrollbar-track{background:transparent}.identity__tabs::-webkit-scrollbar-thumb{background:var(--bee-accent);border-radius:999px}.identity__tabs::-webkit-scrollbar-thumb:hover{background:var(--bee-accent)}.identity__tabs button{flex:1;min-width:max-content;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:600 11px Arial,sans-serif;opacity:.62;cursor:pointer}.identity__tabs button span{font-size:9px;opacity:.55}.identity__tabs button.is-active{border-bottom-color:var(--bee-accent);opacity:1;color:var(--bee-accent)}
    .identity__panel{padding:19px 20px;min-width:0}.identity__section-title{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}.identity__section-title h3,.identity__social h3{font-size:15px;font-weight:600;line-height:1.35;margin:0 0 5px}.identity__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.identity__brand-grid{grid-template-columns:repeat(12,minmax(0,1fr))}.identity__brand-grid>label:nth-child(-n+3){grid-column:span 4}.identity__brand-grid>label:nth-child(4){grid-column:1/-1}.identity__brand-grid>label:nth-child(n+5){grid-column:span 3}.identity__grid label,.identity__asset{display:grid;gap:6px;min-width:0;font:600 11px Arial,sans-serif}.identity__wide{grid-column:1/-1}.identity input:not([type=checkbox]),.identity textarea,.identity select{width:100%;box-sizing:border-box;min-width:0;padding:9px 10px;border:1px solid var(--bee-border);border-radius:8px;background:var(--bee-bg);color:inherit;font:12px Arial,sans-serif}.identity textarea{resize:vertical}.identity input:disabled,.identity textarea:disabled,.identity select:disabled{opacity:.65}.identity label small{font-size:9px;opacity:.55;font-weight:400}
    .identity__asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.identity__asset{padding:12px;border:1px solid var(--bee-border);border-radius:10px;background:var(--bee-bg)}.identity__asset>small{font-size:9px;opacity:.6;font-weight:400}.identity__asset-preview{display:flex;align-items:center;justify-content:center;min-height:64px;max-height:100px;padding:8px;border:1px dashed var(--bee-border);border-radius:7px}.identity__asset-preview img{max-width:100%;max-height:78px;object-fit:contain}.identity__asset-preview span{font-size:10px;opacity:.6}
    .identity__robots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.identity__toggle{display:flex;align-items:flex-start;gap:9px;padding:12px;border:1px solid var(--bee-border);border-radius:9px}.identity__toggle input{margin-top:2px;accent-color:var(--bee-accent)}.identity__toggle span{display:grid;gap:4px}.identity__toggle b{font-size:11px}.identity__toggle small{font-size:9px;line-height:1.4;opacity:.6}
    .identity__social{margin-top:17px;padding-top:16px;border-top:1px solid var(--bee-border)}.identity__social>p{margin-bottom:12px}.identity__snippet{display:grid;gap:5px;margin-top:18px;padding:13px;border:1px solid var(--bee-border);border-radius:9px;background:var(--bee-bg)}.identity__snippet>span{font:700 9px Arial,sans-serif;letter-spacing:.12em;opacity:.5}.identity__snippet>b{font:14px Arial,sans-serif;color:var(--bee-secondary)}.identity__snippet>small{font-size:10px;color:var(--bee-status-success)}.identity__snippet>p{font:11px/1.45 Arial,sans-serif;opacity:.7;margin:0}
    .identity__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-top:1px solid var(--bee-border)}.identity__feedback{font-size:10px;opacity:.65}.identity__feedback.is-error,.identity__message--error{color:var(--bee-status-danger)}.identity__save{padding:9px 14px;border:1px solid var(--bee-accent);border-radius:8px;background:var(--bee-accent);color:var(--bee-accent-text);font:600 11px Arial,sans-serif;cursor:pointer}.identity__save:disabled{opacity:.5;cursor:wait}.identity__message{padding:22px;font-size:12px;opacity:.7}
    @media(max-width:1100px){.identity__brand-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.identity__brand-grid>label:nth-child(-n+3){grid-column:span 2}.identity__brand-grid>label:nth-child(4){grid-column:1/-1}.identity__brand-grid>label:nth-child(n+5){grid-column:span 3}}\n    @media(max-width:760px){.identity__brand-grid{grid-template-columns:1fr}.identity__brand-grid>label{grid-column:1/-1}.identity__heading{padding:15px;flex-direction:row;flex-wrap:wrap}.identity__heading-content{flex-basis:calc(100% - 56px)}.identity__scope{margin-left:55px}.identity__panel{padding:15px}.identity__grid,.identity__asset-grid,.identity__robots{grid-template-columns:1fr}.identity__wide{grid-column:auto}.identity__tabs{padding:0 7px}.identity__tabs button{padding:11px 8px;font-size:10px}}
  `]
})
export class PlatformIdentityComponent implements OnChanges {
  @Input() accessToken = '';
  @Input() editable = false;
  tab:IdentityTab='brand';
  data:PlatformIdentity=structuredClone(EMPTY_IDENTITY);
  loading=true;saving=false;saveError=false;error='';saveMessage='';keywordsText='';failedPreviews:Record<string,boolean>={};
  readonly assetFields:Array<{key:keyof PlatformIdentity['assets'];label:string;hint:string}>= [
    {key:'primaryLogoUrl',label:'Primary horizontal logo',hint:'Main logo for public website headers.'},
    {key:'secondaryLogoUrl',label:'Alternative logo',hint:'Variant for contrasting or dark backgrounds.'},
    {key:'brandMarkUrl',label:'Brand symbol / mark',hint:'Standalone symbol without the wordmark.'},
    {key:'faviconUrl',label:'Favicon',hint:'Browser tab icon, preferably 32×32 or SVG.'},
    {key:'appleTouchIconUrl',label:'Apple touch icon',hint:'Icon used when saving the site on iOS.'},
    {key:'socialImageUrl',label:'Default social sharing image',hint:'Recommended 1200×630 image.'},
    {key:'loginLogoUrl',label:'Login logo',hint:'Logo displayed on authentication screens.'}
  ];
  ngOnChanges(_changes:SimpleChanges):void{
    // The dashboard can create this settings view before its auth state finishes loading.
    // Wait for the bearer token, then load again as soon as Angular updates the input.
    if(this.editable&&!this.accessToken){
      this.loading=false;
      this.error='Waiting for an authenticated platform session…';
      return;
    }
    void this.load();
  }
  private headers():HeadersInit{return this.accessToken?{authorization:'Bearer '+this.accessToken}:{};}
  async load():Promise<void>{
    this.loading=true;this.error='';
    try{
      const endpoint=this.editable?'/api/platform/identity':'/api/public/platform-identity';
      const response=await fetch(endpoint,{headers:this.headers()});
      if(!response.ok)throw new Error(response.status===401?'Your platform session is missing or expired. Please sign in again.':response.status===403?'Platform administrator access is required, or recent MFA verification is needed.':`Could not load platform identity (HTTP ${response.status}).`);
      const value=await response.json() as Partial<PlatformIdentity>;
      this.data={brand:{...EMPTY_IDENTITY.brand,...value.brand},assets:{...EMPTY_IDENTITY.assets,...value.assets},seo:{...EMPTY_IDENTITY.seo,...value.seo}};
      this.keywordsText=this.data.seo.keywords.join(', ');
    }catch(error){this.error=error instanceof Error?error.message:'Could not load platform identity.';}
    finally{this.loading=false;}
  }
  async save():Promise<void>{
    if(!this.editable||!this.accessToken||this.saving)return;
    this.saving=true;this.saveError=false;this.saveMessage='';
    this.data.seo.keywords=this.keywordsText.split(',').map(value=>value.trim()).filter(Boolean).slice(0,20);
    try{
      const response=await fetch('/api/platform/identity',{method:'PUT',headers:{'content-type':'application/json',...this.headers()},body:JSON.stringify(this.data)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not save platform identity.');
      if(result.identity)this.data={brand:{...EMPTY_IDENTITY.brand,...result.identity.brand},assets:{...EMPTY_IDENTITY.assets,...result.identity.assets},seo:{...EMPTY_IDENTITY.seo,...result.identity.seo}};
      this.saveMessage='Identity saved successfully.';
    }catch(error){this.saveError=true;this.saveMessage=error instanceof Error?error.message:'Save failed.';}
    finally{this.saving=false;}
  }
}
