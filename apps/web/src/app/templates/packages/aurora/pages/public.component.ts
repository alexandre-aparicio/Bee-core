import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BeeTemplateSlotComponent } from '../../../template-slot.component';
import type { AppComponent } from '../../../../app.component';

@Component({
  selector: 'bee-template-aurora-page',
  standalone: true,
  imports: [CommonModule, BeeTemplateSlotComponent],
  template: `@if (vm.publicTenant) {
    <div class="bee-tenant tenant-aurora">
      <bee-template-slot name="header"></bee-template-slot>
      <header class="aurora-nav">
        <a class="aurora-brand" href="/" (click)="vm.navigatePublicPath('/', $event)"><span class="aurora-mark">✦</span>{{vm.publicTenant.name}}</a>
        <nav><a href="/" (click)="vm.navigatePublicPath('/', $event)">Home</a>@if(vm.publicTenantPlugins.includes('hello-world')){<a href="/hello-world" (click)="vm.navigatePublicPath('/hello-world', $event)">Hello World</a>}</nav>
        <button class="aurora-mode" (click)="vm.togglePublicThemeMode()">{{vm.publicThemeMode()==='dark'?'☀ Light':'☾ Dark'}}</button>
      </header>
      <main class="aurora-content">
        @if(vm.path==='/hello-world' && vm.publicTenantPlugins.includes('hello-world')) {
          <section class="aurora-hero aurora-plugin"><div class="aurora-kicker">PUBLIC PLUGIN · 01</div><h1>Hello<br><span>World.</span></h1><p>¡Hola Mundo! Este es tu primer plugin público de Bee-Core.</p><a class="aurora-cta" href="/" (click)="vm.navigatePublicPath('/', $event)">← Back home</a></section>
        } @else {
          <section class="aurora-hero"><div class="aurora-kicker">WELCOME TO YOUR DIGITAL SPACE</div><h1>{{vm.publicTenant.name}}<br><span>starts here.</span></h1><p>A place to introduce your company, your work and the things that make you different.</p><a class="aurora-cta" href="#discover">Discover <span>↗</span></a><div class="aurora-orb" aria-hidden="true"></div></section>
          <section class="aurora-discover" id="discover"><div class="aurora-label">01 / ABOUT</div><div><h2>Made to move<br>your ideas forward.</h2><p>This public space is ready to grow with your business. Add your story, services and experiences through enabled plugins.</p></div><div class="aurora-footnote">YOUR COMPANY · YOUR SPACE</div></section>
        }
      </main>
      <footer class="aurora-footer"><bee-template-slot name="footer"></bee-template-slot><span>© {{vm.publicTenant.name}}</span><a href="https://beecore.beeprojects.net">Powered by Bee-Core ↗</a></footer>
    </div>
  } @else {
    <div class="bee-layout" [ngClass]="vm.layoutClass('public')" [attr.data-bee-layout]="vm.layoutId('public')"><bee-template-slot name="header"></bee-template-slot><header class="site-header"><a class="brand" href="/">Bee-Core</a><nav class="nav-links"><a href="#features">Platform</a><a href="#plugins">Plugins</a></nav><button (click)="vm.togglePublicThemeMode()">{{vm.publicThemeMode()==='dark'?'Light':'Dark'}} mode</button><a href="/login">Sign in</a></header><main><section class="hero"><h1>Build less core.<br>Plugin everything.</h1><p>A modular foundation for products that grow with you.</p><a href="/login">Open dashboard</a></section><section id="features"><h2>Composable plugins</h2><p>Extend capabilities without bloating the core.</section><bee-template-slot name="content"></bee-template-slot></main><footer><bee-template-slot name="footer"></bee-template-slot><span>Bee-Core</span></footer></div>
  }`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
  .tenant-aurora{min-height:100vh;padding:0 clamp(22px,6vw,100px);background:radial-gradient(ellipse at 80% 20%,color-mix(in srgb,var(--bee-accent) 45%,transparent) 0%,transparent 38%),radial-gradient(ellipse at 20% 65%,color-mix(in srgb,var(--bee-accent-strong) 35%,transparent) 0%,transparent 38%),var(--bee-bg);color:var(--bee-text);font-family:Inter,ui-sans-serif,system-ui}
  .aurora-nav{max-width:1240px;margin:auto;min-height:84px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid var(--bee-border)}
  .aurora-brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none;font-weight:750;font-size:17px}.aurora-mark{display:grid;place-items:center;width:35px;height:35px;border-radius:12px;background:linear-gradient(135deg,var(--bee-accent),var(--bee-accent-hover));box-shadow:0 0 25px color-mix(in srgb,var(--bee-accent) 27%,transparent)}
  .aurora-nav nav{display:flex;gap:28px}.aurora-nav nav a{color:var(--bee-text-muted);text-decoration:none;font-size:14px}.aurora-nav nav a:hover{color:var(--bee-text)}
  .aurora-mode{border:1px solid var(--bee-border);border-radius:999px;background:color-mix(in srgb,var(--bee-text) 4%,transparent);color:inherit;padding:10px 15px;cursor:pointer}
  .aurora-content{max-width:1240px;margin:auto}.aurora-hero{position:relative;overflow:hidden;min-height:590px;padding:clamp(72px,12vw,150px) 0 90px}.aurora-kicker{font-size:11px;letter-spacing:.2em;color:var(--bee-accent-hover);font-weight:700}.aurora-hero h1{position:relative;z-index:1;font-size:clamp(60px,11vw,132px);letter-spacing:-.085em;line-height:.93;margin:25px 0 32px;font-weight:760}.aurora-hero h1 span{color:var(--bee-accent-hover)}.aurora-hero p{position:relative;z-index:1;max-width:460px;color:var(--bee-text-muted);font-size:18px;line-height:1.8}.aurora-cta{position:relative;z-index:1;display:inline-flex;gap:32px;margin-top:25px;border:1px solid color-mix(in srgb,var(--bee-accent) 40%,transparent);border-radius:999px;padding:14px 20px;color:var(--bee-text);text-decoration:none;background:var(--bee-accent-soft)}.aurora-orb{position:absolute;right:0;top:25%;width:min(38vw,460px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 35% 30%,var(--bee-accent-hover) 0,var(--bee-accent) 20%,var(--bee-accent-strong) 48%,var(--bee-surface-deep) 70%,transparent 72%);filter:drop-shadow(0 0 70px color-mix(in srgb,var(--bee-accent) 27%,transparent));opacity:.75}.aurora-discover{display:grid;grid-template-columns:.6fr 2fr .6fr;gap:32px;border-top:1px solid var(--bee-border);padding:65px 0 90px}.aurora-label,.aurora-footnote{font-size:11px;letter-spacing:.18em;color:var(--bee-text-subtle)}.aurora-discover h2{font-size:clamp(34px,5vw,62px);line-height:1.05;letter-spacing:-.05em;margin:0 0 22px}.aurora-discover p{max-width:620px;color:var(--bee-text-muted);line-height:1.8}.aurora-footer{max-width:1240px;margin:auto;border-top:1px solid var(--bee-border);padding:24px 0;display:flex;justify-content:space-between;gap:20px;color:var(--bee-text-muted);font-size:13px}.aurora-footer a{color:inherit;text-decoration:none}
  @media(max-width:700px){.aurora-nav{flex-wrap:wrap;padding:18px 0}.aurora-nav nav{order:3;width:100%;gap:20px}.aurora-hero{min-height:510px;padding-top:85px}.aurora-orb{right:-15%;top:40%;width:70vw;opacity:.4}.aurora-discover{grid-template-columns:1fr;gap:18px;padding:42px 0}.aurora-footer{flex-direction:column}}
  `]
})
export class BeeAuroraPageComponent { @Input({ required: true }) vm!: AppComponent; }
