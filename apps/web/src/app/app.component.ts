declare const QRCode: any;

import { BeeAuroraPageComponent } from './templates/packages/aurora/pages/public.component';
import { BeeEditorialPageComponent } from './templates/packages/editorial/pages/public.component';
import { BeeStudioPageComponent } from './templates/packages/studio/pages/public.component';
import { BeeMidnightPageComponent } from './templates/packages/midnight/pages/dashboard.component';
import { BeePaperPageComponent } from './templates/packages/paper/pages/dashboard.component';
import { BeeGlassPageComponent } from './templates/packages/glass/pages/dashboard.component';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateEngine } from './templates/template-engine.service';
import type { BeeThemeMode } from './templates/template-engine.service';
import { BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent } from './templates/packages';

@Component({ selector: 'bee-root', standalone: true, imports: [CommonModule, FormsModule, BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent, BeeAuroraPageComponent, BeeEditorialPageComponent, BeeStudioPageComponent, BeeMidnightPageComponent, BeePaperPageComponent, BeeGlassPageComponent], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  constructor(private readonly templates: BeeTemplateEngine) {}

  ngOnInit(): void {
    this.syncActiveSectionFromPath();
    window.addEventListener('popstate', this.handlePublicPopState);
    if (this.dashboard) {
      if (this.auth?.accessToken) void this.validateDashboardSession();
      else void this.refreshDashboardSession();
    } else if (!['/login', '/register', '/forgot'].includes(this.path)) void this.loadPublicTenant();
  }

  private readonly handlePublicPopState = (): void => {
    this.path = window.location.pathname;
    this.syncActiveSectionFromPath();
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
  auth: any = null;
  mfaCode = '';
  mfaRequired = false;
  mfaSetupMode = false;
  mfaSetupSecret = '';
  mfaSetupUri = '';
  mfaQrDataUrl = '';
  mfaRecoveryCodes: string[] = [];
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
  get dashboard(): boolean { return this.path === '/dashboard' || this.path.startsWith('/dashboard/'); }
  get signedEmail(): string { return this.auth?.user?.email || 'Workspace user'; }
  get initial(): string { return this.signedEmail.charAt(0).toUpperCase(); }
  async signIn(e: Event): Promise<void> {
    e.preventDefault();
    if (this.mfaSetupMode) { await this.confirmMfaSetup(e); return; }
    this.error = '';
    if (this.mode !== 'login') { this.error = this.mode === 'register' ? 'Self-registration is not enabled yet. Contact your workspace administrator.' : 'Password recovery is not configured yet. Contact your workspace administrator.'; return; }
    this.busy = true;
    try {
      const response = await fetch(this.api + '/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: this.email, password: this.password, client: 'dashboard', ...(this.mfaCode ? { mfaCode: this.mfaCode } : {}) }) });
      const result = await response.json();
      if (!response.ok) { if (result.mfaRequired) this.mfaRequired = true; throw new Error(result.error || 'Login failed'); }
      this.auth = result;
      this.templates.setAuthSession(this.auth);
      if (result.mfaSetupRequired) {
        const setup = await fetch(this.api + '/auth/mfa/setup', { method: 'POST', credentials: 'same-origin', headers: { authorization: 'Bearer ' + result.accessToken } });
        const setupResult = await setup.json();
        if (!setup.ok) throw new Error(setupResult.error || 'Could not start MFA setup');
        this.mfaSetupSecret = setupResult.secret; this.mfaSetupUri = setupResult.provisioningUri; this.mfaSetupMode = true; this.mfaRequired = false; this.error = ''; this.renderMfaQr(); return;
      }
      window.location.assign('/dashboard');
    } catch (err) { this.error = err instanceof Error ? err.message : 'Sign in failed'; }
    finally { this.busy = false; }
  }
  private renderMfaQr(): void {
    if (!this.mfaSetupUri) { this.mfaQrDataUrl = ''; return; }
    const container = document.createElement('div');
    new QRCode(container, { text: this.mfaSetupUri, width: 240, height: 240, colorDark: '#111827', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
    this.mfaQrDataUrl = canvas?.toDataURL('image/png') ?? '';
  }

  async confirmMfaSetup(e: Event): Promise<void> {
    e.preventDefault(); this.error = ''; this.busy = true;
    try {
      const response = await fetch(this.api + '/auth/mfa/confirm', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.auth?.accessToken }, body: JSON.stringify({ code: this.mfaCode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'MFA verification failed');
      this.auth = { ...this.auth, accessToken: result.accessToken, platformRole: result.platformRole };
      this.templates.setAuthSession(this.auth);
      this.mfaSetupMode = false; this.mfaCode = ''; this.mfaQrDataUrl = ''; this.mfaRecoveryCodes = result.recoveryCodes || [];
    } catch (err) { this.error = err instanceof Error ? err.message : 'MFA setup failed'; }
    finally { this.busy = false; }
  }
  finishMfaSetup(): void { this.mfaRecoveryCodes = []; this.mfaQrDataUrl = ''; window.location.assign('/dashboard'); }
  async loadPublicTenant(): Promise<void> {
    this.publicTenantLoading = true;
    await this.loadPublicPlatformIdentity();
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

  private async loadPublicPlatformIdentity(): Promise<void> {
    try {
      const response = await fetch(this.api + '/public/platform-identity');
      if (!response.ok) return;
      const identity = await response.json();
      const brand = identity.brand || {};
      const assets = identity.assets || {};
      const seo = identity.seo || {};
      const title = seo.title || brand.pageTitle || brand.platformName || 'Bee-Core';
      document.title = title;
      const setMeta = (key: string, value: string, attribute: 'name' | 'property' = 'name'): void => {
        if (typeof value !== 'string' || !value.trim()) return;
        let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
        if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
        element.content = value.trim();
      };
      const setLink = (rel: string, href: string, sizes?: string): void => {
        if (typeof href !== 'string' || !href.trim()) return;
        let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
        if (!element) { element = document.createElement('link'); element.rel = rel; document.head.appendChild(element); }
        element.href = href.trim();
        if (sizes) element.setAttribute('sizes', sizes);
      };
      setMeta('description', seo.description || brand.description || '');
      setMeta('keywords', Array.isArray(seo.keywords) ? seo.keywords.join(', ') : '');
      setMeta('robots', `${seo.robotsIndex === false ? 'noindex' : 'index'},${seo.robotsFollow === false ? 'nofollow' : 'follow'}`);
      setMeta('og:type', 'website', 'property');
      setMeta('og:title', seo.openGraphTitle || title, 'property');
      setMeta('og:description', seo.openGraphDescription || seo.description || brand.description || '', 'property');
      setMeta('og:url', seo.canonicalUrl || brand.websiteUrl || window.location.href, 'property');
      setMeta('og:image', seo.openGraphImageUrl || assets.socialImageUrl || '', 'property');
      setMeta('twitter:card', seo.twitterCard || 'summary_large_image');
      setMeta('twitter:title', seo.twitterTitle || seo.openGraphTitle || title);
      setMeta('twitter:description', seo.twitterDescription || seo.description || brand.description || '');
      setMeta('twitter:image', seo.twitterImageUrl || seo.openGraphImageUrl || assets.socialImageUrl || '');
      if (seo.canonicalUrl || brand.websiteUrl) {
        let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
        canonical.href = seo.canonicalUrl || brand.websiteUrl;
      }
      setLink('icon', assets.faviconUrl || '');
      setLink('apple-touch-icon', assets.appleTouchIconUrl || '', '180x180');
    } catch {
      // Public identity metadata is an enhancement; the website remains available with document defaults.
    }
  }

  async validateDashboardSession(): Promise<void> {
    try {
      const response = await fetch(this.api + '/auth/me', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken } });
      const result = await response.json();
      if (!response.ok || !result.authenticated) throw new Error(result.error || 'Session expired');
      this.auth = { ...this.auth, tenantId: result.tenantId || this.auth.tenantId, platformRole: result.platformRole ?? this.auth.platformRole };
      this.templates.setAuthSession(this.auth);
      await this.loadCompanies();
      window.setTimeout(() => void this.refreshDashboardSession(), 15 * 60 * 1000);
    } catch { await this.refreshDashboardSession(); }
  }
  async refreshDashboardSession(): Promise<void> {
    try {
      const response = await fetch(this.api + '/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok || !result.accessToken) throw new Error(result.error || 'Session expired');
      this.auth = { ...result, client: 'dashboard' };
      this.templates.setAuthSession(this.auth);
      const check = await fetch(this.api + '/auth/me', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken } });
      const checked = await check.json();
      if (!check.ok || !checked.authenticated) throw new Error(checked.error || 'Session validation failed');
      this.auth = { ...this.auth, tenantId: checked.tenantId || this.auth.tenantId, platformRole: checked.platformRole ?? this.auth.platformRole };
      this.templates.setAuthSession(this.auth);
      await this.loadCompanies();
      window.setTimeout(() => void this.refreshDashboardSession(), 15 * 60 * 1000);
    } catch { this.auth = null; this.templates.setAuthSession(null); window.location.replace('/login'); }
  }

  async loadCompanies(): Promise<void> {
    try {
      const response = await fetch(this.api + '/companies', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load companies');
      this.companies = result.companies || [];
      const active = this.companies.find(company => company.active) || this.companies.find(company => company.id === (this.auth.tenantId || this.auth.user?.tenantId));
      if (active) {
        this.activeCompanyId = active.id;
        this.activeCompanyName = active.name;
        this.activeCompanyRole = active.role;
      }
      // Resolve deep-linked settings routes only after the active tenant role is known.
      this.syncActiveSectionFromPath();
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
        method: 'POST', credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not switch company');
      const roles = result.membership?.role === 'owner' || result.membership?.role === 'admin' ? ['admin'] : ['user'];
      this.auth = { ...this.auth, accessToken: result.accessToken, tenantId: result.tenantId, user: { ...this.auth.user, tenantId: result.tenantId, roles } };
      this.templates.setAuthSession(this.auth);
      await this.templates.refreshForActiveCompany();
      await this.loadCompanies();
      this.companyBusy = false;
    } catch (error) {
      this.companyError = error instanceof Error ? error.message : 'Could not switch company';
      this.companyBusy = false;
      await this.loadCompanies();
    }
  }
  async logout(): Promise<void> {
    try { if (this.auth?.accessToken) await fetch(this.api + '/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken } }); }
    finally { this.auth = null; this.templates.setAuthSession(null); window.location.assign('/login'); }
  }
  toggleMenu(): void { this.menuOpen = !this.menuOpen; }

  activeSection = 'dashboard';
  expandedMenuId = '';
  private readonly sectionRoutes: Record<string, string> = {
    dashboard: '/dashboard', plugins: '/dashboard/plugins', organization: '/dashboard/organization', 'organization-company':'/dashboard/organization/company', 'organization-users':'/dashboard/organization/users', 'organization-teams':'/dashboard/organization/teams', 'organization-roles':'/dashboard/organization/roles',
    activity: '/dashboard/activity', mail: '/dashboard/mail', notifications: '/dashboard/notifications', messages: '/dashboard/messages', 'settings-general': '/dashboard/settings/general',
    'settings-tenants': '/dashboard/settings/tenants', 'settings-plugins': '/dashboard/settings/plugins',
    'settings-integrations': '/dashboard/settings/integrations', 'settings-plans': '/dashboard/settings/plans-licensing',
    'settings-security': '/dashboard/settings/security', 'settings-infrastructure': '/dashboard/settings/infrastructure',
    'settings-localization': '/dashboard/settings/localization',
    'themes-dashboard': '/dashboard/themes', 'themes-public': '/dashboard/public-theme',
    branding: '/dashboard/branding', domains: '/dashboard/domains', integrations: '/dashboard/integrations',
    security: '/dashboard/security', system: '/dashboard/system'
  };
  private readonly allSettingsSections = [
    {id:'settings-general',label:'General',icon:'◉',description:'Platform name, domain, identity and global configuration.'},
    {id:'settings-tenants',label:'Tenants',icon:'▤',description:'Tenant directory, company status, subdomains and platform-level controls.'},
    {id:'settings-plugins',label:'Plugins',icon:'▣',description:'Catalogue, authorization, versions and dependencies.'},
    {id:'settings-integrations',label:'Integrations',icon:'⌘',description:'Available connectors, global credentials and policies.'},
    {id:'settings-plans',label:'Plans & Licensing',icon:'◇',description:'Plans, subscriptions, pricing and licenses.'},
    {id:'settings-security',label:'Security',icon:'⌑',description:'Global policies, authentication, sessions and audit.'},
    {id:'settings-infrastructure',label:'Infrastructure',icon:'⌁',description:'Runtime, storage, queues, logs and services.'},
    {id:'settings-localization',label:'Localization',icon:'◎',description:'Languages, regions, currencies and global formats.'}
  ];
  private syncActiveSectionFromPath(): void {
    if (/^\/dashboard\/plugins\/[^/]+\/details\/?$/.test(this.path)) { this.activeSection = 'settings-plugins'; this.expandedMenuId = 'settings'; return; }
    if (this.path.startsWith('/dashboard/settings/tenants/') && this.path.endsWith('/manage')) {
      this.activeSection = 'settings-tenants';
      this.expandedMenuId = 'settings';
      return;
    }
    if (this.path === '/dashboard/settings') { this.activeSection = 'settings-general'; this.expandedMenuId = 'settings'; return; }
    const entry = Object.entries(this.sectionRoutes).find(([, route]) => route === this.path);
    const nextSection = entry?.[0] || 'dashboard';
    this.activeSection = nextSection.startsWith('settings-') && !this.settingsNavigationItems.some(item => item.id === nextSection)
      ? 'dashboard'
      : nextSection;
    this.expandedMenuId = this.activeSection.startsWith('settings-') ? 'settings' : (['notifications','messages'].includes(this.activeSection) ? 'notifications' : this.activeSection.startsWith('organization-') ? 'organization' : '');
  }
  get pluginDetailsId(): string { const match = this.path.match(/^\/dashboard\/plugins\/([^/]+)\/details\/?$/); return match ? decodeURIComponent(match[1]) : ''; }
  get platformTenantId(): string {
    const parts = this.path.split('/');
    return parts.length >= 6 && parts[1] === 'dashboard' && parts[2] === 'settings' && parts[3] === 'tenants' && parts[5] === 'manage'
      ? decodeURIComponent(parts[4])
      : '';
  }
  navigatePlatformManage(tenantId: string): void {
    const route = '/dashboard/settings/tenants/' + encodeURIComponent(tenantId) + '/manage';
    window.history.pushState({}, '', route);
    this.path = route;
    this.activeSection = 'settings-tenants';
    this.menuOpen = false;
  }
  navigatePlatformList(): void { this.navigateSection('settings-tenants'); }
  get isPlatformAdmin(): boolean { return this.auth?.platformRole === 'superadmin'; }
  get canManageAppearance(): boolean { return this.isPlatformAdmin || ['owner','admin'].includes((this.activeCompanyRole || '').toLowerCase()); }
  get sectionTitle(): string { const organizationTitles: Record<string,string> = {'organization-company':'Company','organization-users':'Users','organization-teams':'Teams','organization-roles':'Roles & Permissions'}; return organizationTitles[this.activeSection] || (this.activeSection === 'notifications' ? 'Notifications' : this.activeSection === 'messages' ? 'Chat' : this.settingsNavigationItems.find(item => item.id === this.activeSection)?.label || this.navigationItems.find(item => item.id === this.activeSection)?.label || 'Dashboard'); }
  get settingsNavigationItems(): Array<{id:string;label:string;icon:string;description:string}> {
    const role = (this.activeCompanyRole || '').toLowerCase();
    const allowed = this.isPlatformAdmin
      ? this.allSettingsSections.map(item => item.id)
      : ['owner','admin'].includes(role)
        ? ['settings-general','settings-plugins','settings-integrations','settings-security','settings-localization']
        : ['settings-localization'];
    return this.allSettingsSections.filter(item => allowed.includes(item.id)).map(item => ({
      ...item,
      description: item.id === 'settings-general' && !this.isPlatformAdmin
        ? 'Company name, identity and tenant-wide configuration.'
        : item.description
    }));
  }
  get settingsComponentSection(): string {
    return this.activeSection.replace('settings-', '') === 'plans' ? 'plans' : this.activeSection.replace('settings-', '');
  }
  get settingsSectionTitle(): string { return this.settingsNavigationItems.find(item => item.id === this.activeSection)?.label || 'Settings'; }
  get settingsSectionDescription(): string { return this.settingsNavigationItems.find(item => item.id === this.activeSection)?.description || 'Manage your workspace preferences.'; }
  toggleNavigationMenu(menuId: string): void {
    this.expandedMenuId = this.expandedMenuId === menuId ? '' : menuId;
    if (this.expandedMenuId === 'settings' && !this.activeSection.startsWith('settings-')) {
      const first = this.settingsNavigationItems[0];
      if (first) this.navigateSection(first.id);
    }
  }
  get navigationItems(): Array<{id:string;label:string;icon:string;group:string}> {
    const base = [
      {id:'dashboard',label:'Dashboard',icon:'▦',group:'WORKSPACE'},
      {id:'organization',label:'Organization',icon:'♙',group:'WORKSPACE'},
      {id:'activity',label:'Activity',icon:'◷',group:'WORKSPACE'},
      {id:'mail',label:'Mail',icon:'✉',group:'WORKSPACE'},
      {id:'notifications',label:'Notifications',icon:'♧',group:'WORKSPACE'},
      {id:'settings',label:'Settings',icon:'⚙',group:'SYSTEM'}
    ];
    if (this.isPlatformAdmin) return base.filter(item => ['dashboard','organization','activity','mail','notifications','settings'].includes(item.id));
    const role = (this.activeCompanyRole || '').toLowerCase();
    if (role === 'manager') return base;
    if (role === 'owner' || role === 'admin') return base;
    return base.filter(item => ['dashboard','organization','mail','notifications','settings'].includes(item.id));
  }
  get visibleMenuGroups(): string[] { return [...new Set(this.navigationItems.map(item => item.group))]; }
  navigateSection(id: string): void {
    const targetId = id === 'settings' ? this.settingsNavigationItems[0]?.id : id;
    if (!targetId) return;
    if (targetId.startsWith('settings-') && !this.settingsNavigationItems.some(item => item.id === targetId)) return;
    const route = this.sectionRoutes[targetId];
    if (!route) return;
    if (window.location.pathname !== route) window.history.pushState({}, '', route);
    this.path = route;
    this.activeSection = targetId;
    this.expandedMenuId = targetId.startsWith('settings-') ? 'settings' : (['notifications','messages'].includes(targetId) ? 'notifications' : targetId.startsWith('organization-') ? 'organization' : '');
    this.menuOpen = false;
  }

  bars = [30,52,44,67,46,80,60,92,56,72,48,85,62,95,54,74,40,63,80,47,70,98,56,72];
}