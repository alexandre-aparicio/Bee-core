import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BeeTemplateSlotComponent } from '../../../template-slot.component';
import type { AppComponent } from '../../../../app.component';

@Component({
  selector: 'bee-template-editorial-page',
  standalone: true,
  imports: [CommonModule, BeeTemplateSlotComponent],
  template: `@if (vm.publicTenant) {
    <div class="bee-tenant tenant-editorial">
      <bee-template-slot name="header"></bee-template-slot>
      <header class="ed-nav"><a class="ed-wordmark" href="/" (click)="vm.navigatePublicPath('/', $event)">{{vm.publicTenant.name}}<span>INDEPENDENT COMPANY</span></a><nav><a href="/" (click)="vm.navigatePublicPath('/', $event)">Home</a>@if(vm.publicTenantPlugins.includes('hello-world')){<a href="/hello-world" (click)="vm.navigatePublicPath('/hello-world', $event)">Hello World</a>}</nav><button (click)="vm.togglePublicThemeMode()">{{vm.publicThemeMode()==='dark'?'Light edition':'Dark edition'}}</button></header>
      <main class="ed-main">
        @if(vm.path==='/hello-world' && vm.publicTenantPlugins.includes('hello-world')) {
          <article class="ed-article"><div class="ed-meta">PUBLIC NOTE · PLUGIN 01</div><h1>Hello<br><em>World.</em></h1><p class="ed-lead">¡Hola Mundo! Este es tu primer plugin público de Bee-Core.</p><div class="ed-rule"></div><a class="ed-link" href="/" (click)="vm.navigatePublicPath('/', $event)">← Return to home</a></article>
        } @else {
          <article class="ed-article"><div class="ed-meta">WELCOME · {{vm.publicTenant.name}}</div><h1>A story of<br><em>what comes next.</em></h1><p class="ed-lead">Every business has a story worth telling. This is the beginning of yours, told simply and with intention.</p><div class="ed-rule"></div><div class="ed-columns"><div class="ed-index">01<br><span>OUR APPROACH</span></div><div><h2>Thoughtful work.<br>Meaningful progress.</h2><p>This page is your starting point. Introduce your company, share what you believe in, and let your work speak through the plugins and content you choose to publish.</p></div></div><div class="ed-endnote">A PUBLIC SPACE FOR {{vm.publicTenant.name}}</div></article>
        }
      </main>
      <footer class="ed-footer"><bee-template-slot name="footer"></bee-template-slot><span>© {{vm.publicTenant.name}}</span><a href="https://beecore.beeprojects.net">Bee-Core</a></footer>
    </div>
  } @else {
    <div class="bee-layout" [ngClass]="vm.layoutClass('public')" [attr.data-bee-layout]="vm.layoutId('public')"><bee-template-slot name="header"></bee-template-slot><header class="site-header"><a class="brand" href="/">Bee-Core</a><nav class="nav-links"><a href="#features">Platform</a><a href="#plugins">Plugins</a></nav><button (click)="vm.togglePublicThemeMode()">{{vm.publicThemeMode()==='dark'?'Light':'Dark'}} mode</button><a href="/login">Sign in</a></header><main><section class="hero"><h1>Build less core.<br>Plugin everything.</h1><p>A modular foundation for products that grow with you.</p><a href="/login">Open dashboard</a></section><section id="features"><h2>Composable plugins</h2><p>Extend capabilities without bloating the core.</section><bee-template-slot name="content"></bee-template-slot></main><footer><bee-template-slot name="footer"></bee-template-slot><span>Bee-Core</span></footer></div>
  }`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
  .tenant-editorial{--e-bg:#f3efe6;--e-text:#26251f;--e-muted:#6c685f;--e-line:#d8d1c4;min-height:100vh;background:var(--e-bg);color:var(--e-text);padding:0 clamp(20px,7vw,120px);font-family:Georgia,'Times New Roman',serif}
  .ed-nav{max-width:1240px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:30px;padding:28px 0;border-bottom:1px solid var(--e-line)}.ed-wordmark{font-size:21px;font-weight:bold;color:inherit;text-decoration:none}.ed-wordmark span{display:block;font:10px Arial,sans-serif;letter-spacing:.16em;color:var(--e-muted);margin-top:5px}.ed-nav nav{display:flex;gap:25px}.ed-nav nav a{font:13px Arial,sans-serif;color:var(--e-muted);text-decoration:none}.ed-nav button{background:transparent;border:1px solid var(--e-line);padding:10px 14px;color:inherit;font:12px Arial,sans-serif;cursor:pointer}
  .ed-main{max-width:1060px;margin:0 auto;min-height:75vh}.ed-article{padding:clamp(75px,11vw,145px) 0}.ed-meta{font:11px Arial,sans-serif;letter-spacing:.18em;color:#898173}.ed-article h1{font-size:clamp(56px,10vw,116px);font-weight:400;line-height:.95;letter-spacing:-.06em;margin:30px 0}.ed-article h1 em{font-weight:400;color:#837763}.ed-lead{max-width:680px;font-size:clamp(20px,2.4vw,28px);line-height:1.65;color:#625e55}.ed-rule{height:1px;background:var(--e-line);margin:65px 0}.ed-columns{display:grid;grid-template-columns:.7fr 2fr;gap:40px}.ed-index{font:12px Arial,sans-serif;color:#8a8274;letter-spacing:.1em}.ed-index span{font-size:10px}.ed-columns h2{font-size:clamp(27px,4vw,46px);font-weight:400;line-height:1.1;margin:0 0 18px}.ed-columns p{max-width:640px;line-height:1.9;color:var(--e-muted)}.ed-endnote{margin-top:60px;font:10px Arial,sans-serif;letter-spacing:.16em;color:#8a8274}.ed-link{font:13px Arial,sans-serif;color:inherit;text-decoration:none}.ed-footer{max-width:1240px;margin:auto;border-top:1px solid var(--e-line);padding:24px 0;display:flex;justify-content:space-between;color:#777166;font:12px Arial,sans-serif}.ed-footer a{color:inherit;text-decoration:none}
  @media(max-width:700px){.ed-nav{flex-wrap:wrap}.ed-nav nav{order:3;width:100%}.ed-article h1{font-size:clamp(48px,14vw,78px)}.ed-columns{grid-template-columns:1fr;gap:20px}.ed-footer{flex-direction:column;gap:9px}}
  `]
})
export class BeeEditorialPageComponent { @Input({ required: true }) vm!: AppComponent; }
