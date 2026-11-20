import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateManagerComponent } from './templates/template-manager.component';
import { BeeTemplateEngine } from './templates/template-engine.service';
import type { BeeThemeMode } from './templates/template-engine.service';
import { BeeTemplateSlotComponent } from './templates/template-slot.component';
import { BeeMarketplaceComponent } from './marketplace/marketplace.component';
import { CompanyMembersComponent } from './company-members/company-members.component';
import { BeePluginOutletComponent } from './plugins/plugin-outlet.component';
import { AuditLogComponent } from './audit-log/audit-log.component';
import { PlatformAdminComponent } from './platform-admin/platform-admin.component';
import { BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent } from './templates/packages';

@Component({ selector: 'bee-root', standalone: true, imports: [CommonModule, FormsModule, BeeTemplateManagerComponent, BeeTemplateSlotComponent, BeeMarketplaceComponent, CompanyMembersComponent, BeePluginOutletComponent, AuditLogComponent, PlatformAdminComponent, BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  constructor(private readonly templates: BeeTemplateEngine) {}

  ngOnInit(): void {
    window.addEventListener('popstate', this.handlePublicPopState);
    if (this.dashboard && this.auth?.accessToken) void this.loadCompanies();
    else if (!['/login', '/register', '/forgot'].includes(this.path)) void this.loadPublicTenant();
  }

  private readonly handlePublicPopState = (): void => {
    this.path = window.location.pathname;
    this.menuOpen = false;
  };

  navigatePublicPath(path: '/' | '/hello-world', event: Event): void {
    event.preventDefault();
    if (this.path === path) return;
    window.history.pushState({}, '', path);
    this.path = path;
    this.menuOpen = false;
  }

  layoutId(target: 'public' | 'dashboard'): string { return this.templates.getActive(target).layout; }
  publicThemeMode(): BeeThemeMode { return this.templates.getMode('public'); }
  togglePublicThemeMode(): void { this.templates.toggleMode('public'); }
  dashboardThemeMode(): BeeThemeMode { return this.templates.getMode('dashboard'); }
  toggleDashboardThemeMode(): void { this.templates.toggleMode('dashboard'); }
  layoutClass(target: 'public' | 'dashboard'): string { return 'bee-layout--' + this.layoutId(target).replace('.', '-'); }

  path = window.location.pathname;
  menuOpen = false;
  email = ''; password = ''; reveal = false; busy = false; error = '';
  auth: any = this.readSession();
  api = '/api';
  publicTenant: { id: string; name: string; slug: string | null } | null = null;
  publicTenantPlugins: string[] = [];
  publicTenantLoading = false;
  publicTenantNotFound = false;
  publicTenantError = '';
  companies: Array<{id:string;name:string;role:string;active:boolean}> = [];
  activeCompanyId = '';
  activeCompanyName = 'Bee workspace';
  activeCompanyRole = 'Workspace';
  companyError = '';
  companyBusy = false;
  activePlugins: string[] = [];
  setActivePlugins(pluginIds: string[]): void { this.activePlugins = pluginIds; }
  get mode(): 'login'|'register'|'forgot' { return this.path === '/register' ? 'register' : this.path === '/forgot' ? 'forgot' : 'login'; }
  get dashboard(): boolean { return this.path === '/dashboard'; }
  get signedEmail(): string { return this.auth?.user?.email || 'Workspace user'; }
  get initial(): string { return this.signedEmail.charAt(0).toUpperCase(); }
  private readSession(): any { try { return JSON.parse(localStorage.getItem('bee-auth') || 'null'); } catch { return null; } }
  async signIn(e: Event): Promise<void> { e.preventDefault(); this.error = ''; if (this.mode !== 'login') { this.error = this.mode === 'register' ? 'Self-registration is not enabled yet. Contact your workspace administrator.' : 'Password recovery is not configured yet. Contact your workspace administrator.'; return; } this.busy = true; try { const response = await fetch(this.api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: this.email, password: this.password, client: 'dashboard' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Login failed'); localStorage.setItem('bee-auth', JSON.stringify(result)); window.location.assign('/dashboard'); } catch (err) { this.error = err instanceof Error ? err.message : 'Sign in failed'; } finally { this.busy = false; } }
  async loadPublicTenant(): Promise<void> {
    this.publicTenantLoading = true;
    this.publicTenantNotFound = false;
    this.publicTenantError = '';
    try {
      const response = await fetch(this.api + '/public/tenant');
      if (response.status === 404) {
        this.publicTenantNotFound = true;
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not resolve public website');
      if (result.kind === 'tenant' && result.tenant?.id && result.tenant?.name) {
        this.publicTenant = result.tenant;
        const pluginResponse = await fetch(this.api + '/public/tenant/plugins');
        if (pluginResponse.ok) { const pluginResult = await pluginResponse.json(); this.publicTenantPlugins = pluginResult.pluginIds || []; }
      } else if (result.kind !== 'corporate') {
        this.publicTenantNotFound = true;
      }
    } catch (error) {
      this.publicTenantError = error instanceof Error ? error.message : 'Public website is unavailable';
      this.publicTenantNotFound = true;
    } finally {
      this.publicTenantLoading = false;
    }
  }

  async loadCompanies(): Promise<void> {
    try {
      const response = await fetch(this.api + '/companies', { headers: { authorization: 'Bearer ' + this.auth.accessToken } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load companies');
      this.companies = result.companies || [];
      const active = this.companies.find(company => company.active) || this.companies.find(company => company.id === (this.auth.tenantId || this.auth.user?.tenantId));
      if (active) {
        this.activeCompanyId = active.id;
        this.activeCompanyName = active.name;
        this.activeCompanyRole = active.role;
      }
    } catch (error) {
      this.companyError = error instanceof Error ? error.message : 'Could not load companies';
    }
  }
  async switchCompany(companyId: string): Promise<void> {
    if (!companyId || companyId === this.activeCompanyId || this.companyBusy) return;
    this.companyBusy = true;
    this.companyError = '';
    try {
      const response = await fetch(this.api + '/companies/' + encodeURIComponent(companyId) + '/activate', {
        method: 'POST', headers: { authorization: 'Bearer ' + this.auth.accessToken }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not switch company');
      const roles = result.membership?.role === 'owner' || result.membership?.role === 'admin' ? ['admin'] : ['user'];
      this.auth = { ...this.auth, accessToken: result.accessToken, tenantId: result.tenantId, user: { ...this.auth.user, tenantId: result.tenantId, roles } };
      localStorage.setItem('bee-auth', JSON.stringify(this.auth));
      await this.templates.refreshForActiveCompany();
      await this.loadCompanies();
      this.companyBusy = false;
    } catch (error) {
      this.companyError = error instanceof Error ? error.message : 'Could not switch company';
      this.companyBusy = false;
      await this.loadCompanies();
    }
  }
  logout(): void { localStorage.removeItem('bee-auth'); window.location.assign('/login'); }
  toggleMenu(): void { this.menuOpen = !this.menuOpen; }

  activeSection = 'dashboard';
  get isPlatformAdmin(): boolean { return this.auth?.platformRole === 'superadmin'; }
  get canManageAppearance(): boolean { return this.isPlatformAdmin || ['owner','admin'].includes((this.activeCompanyRole || '').toLowerCase()); }
  get sectionTitle(): string { return this.navigationItems.find(item => item.id === this.activeSection)?.label || 'Dashboard'; }
  get navigationItems(): Array<{id:string;label:string;icon:string;group:string}> {
    const base = [
      {id:'dashboard',label:'Dashboard',icon:'▦',group:'WORKSPACE'},
      {id:'plugins',label:'Plugins',icon:'▣',group:'WORKSPACE'},
      {id:'organization',label:'Organization',icon:'♙',group:'WORKSPACE'},
      {id:'activity',label:'Activity',icon:'◷',group:'WORKSPACE'},
      {id:'settings',label:'Settings',icon:'⚙',group:'SYSTEM'}
    ];
    if (this.isPlatformAdmin) return [
      base[0], base[1], base[3], base[4],
      {id:'platform',label:'Platform Administration',icon:'⬡',group:'PLATFORM'},
      {id:'themes-dashboard',label:'Dashboard Theme',icon:'◈',group:'APPEARANCE'},
      {id:'themes-public',label:'Public Theme',icon:'◈',group:'APPEARANCE'},
      {id:'branding',label:'Branding',icon:'✦',group:'APPEARANCE'},
      {id:'domains',label:'Domains',icon:'◎',group:'SYSTEM'},
      {id:'integrations',label:'Integrations',icon:'⌘',group:'SYSTEM'},
      {id:'security',label:'Security',icon:'🔒',group:'PLATFORM'},
      {id:'system',label:'System',icon:'⚙',group:'PLATFORM'}
    ];
    const role = (this.activeCompanyRole || '').toLowerCase();
    if (role === 'owner') return [...base,{id:'themes-dashboard',label:'Dashboard Theme',icon:'◈',group:'APPEARANCE'},{id:'themes-public',label:'Public Theme',icon:'◈',group:'APPEARANCE'},{id:'branding',label:'Branding',icon:'✦',group:'APPEARANCE'},{id:'domains',label:'Domains',icon:'◎',group:'SYSTEM'},{id:'integrations',label:'Integrations',icon:'⌘',group:'SYSTEM'}];
    if (role === 'admin') return [...base,{id:'themes-dashboard',label:'Dashboard Theme',icon:'◈',group:'APPEARANCE'},{id:'themes-public',label:'Public Theme',icon:'◈',group:'APPEARANCE'},{id:'branding',label:'Branding',icon:'✦',group:'APPEARANCE'}];
    if (role === 'manager') return base.filter(item => ['dashboard','plugins','organization','activity'].includes(item.id));
    return base.filter(item => ['dashboard','plugins','organization'].includes(item.id));
  }
  get visibleMenuGroups(): string[] { return [...new Set(this.navigationItems.map(item => item.group))]; }
  navigateSection(id: string): void { this.activeSection = id; this.menuOpen = false; }

  bars = [30,52,44,67,46,80,60,92,56,72,48,85,62,95,54,74,40,63,80,47,70,98,56,72];
}