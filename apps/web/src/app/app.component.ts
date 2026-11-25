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
import { BeeI18nService } from './i18n/bee-i18n.service';
import { BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent } from './templates/packages';

@Component({ selector: 'bee-root', standalone: true, imports: [CommonModule, FormsModule, BeeAuroraLayoutComponent, BeeEditorialLayoutComponent, BeeStudioLayoutComponent, BeeMidnightLayoutComponent, BeePaperLayoutComponent, BeeGlassLayoutComponent, BeeAuroraPageComponent, BeeEditorialPageComponent, BeeStudioPageComponent, BeeMidnightPageComponent, BeePaperPageComponent, BeeGlassPageComponent], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  constructor(private readonly templates: BeeTemplateEngine, private readonly i18n: BeeI18nService) {}

  ngOnInit(): void {
    this.syncActiveSectionFromPath();
    window.addEventListener('popstate', this.handlePublicPopState);
    if (this.path === '/invite/accept') void this.loadInvitation();
    else if (this.dashboard) {
      if (this.auth?.accessToken) void this.validateDashboardSession();
      else void this.refreshDashboardSession();
    } else if (!['/login', '/register', '/forgot', '/invite/accept'].includes(this.path)) void this.loadPublicTenant();
  }

  private readonly handlePublicPopState = (): void => {
    this.path = window.location.pathname;
    this.syncActiveSectionFromPath();
    this.menuOpen = false;
    if (this.path === '/invite/accept') void this.loadInvitation();
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
  invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token') || '';
  invitationPreview: { email:string; companyName:string; role:string; restrictions:string[]; expiresAt:string } | null = null;
  invitationLoading = true;
  invitationExistingAccount = false;
  invitationPassword = '';
  invitationPasswordConfirm = '';
  invitationMfaCode = '';
  invitationMfaRequired = false;
  invitationBusy = false;
  invitationError = '';
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
  private pluginResourceIds: Record<string, string> = {};
  get pluginResourceIdMap(): Record<string, string> { return this.pluginResourceIds; }
  pluginNavigationItems: Array<{id:string;label:string;path:string}> = [];
  private pluginNavigationSequence = 0;
  setActivePlugins(pluginIds: string[]): void {
    this.activePlugins = [...new Set(pluginIds)];
    this.i18n.setInstalledModules(this.activePlugins);
    void this.refreshPluginNavigation();
  }
  private async refreshPluginNavigation(): Promise<void> {
    const sequence = ++this.pluginNavigationSequence;
    const token = String(this.auth?.accessToken ?? "");
    const candidates = this.activePlugins.filter(id => !["connected-devices", "time-tracking"].includes(id));
    if (!token || !candidates.length) { this.pluginNavigationItems = []; this.syncActiveSectionFromPath(); return; }
    const items = await Promise.all(candidates.map(async id => {
      try {
        // pluginKey is the internal ID; the API route requires the tenant-masked resource ID.
        const resourceId = this.pluginResourceIds[id];
        if (!resourceId) return null;
        const response = await fetch(this.api + "/marketplace/plugins/" + encodeURIComponent(resourceId) + "/runtime", {
          method: "GET", credentials: "same-origin", headers: { authorization: "Bearer " + token }
        });
        if (!response.ok) return null;
        const runtime = await response.json();
        if (runtime?.pluginId !== id || !Array.isArray(runtime.routes)) return null;
        const route = runtime.routes.find((item: any) =>
          typeof item?.path === "string" && item.path.startsWith("/dashboard/") &&
          !item.path.startsWith("//") && !item.path.includes("..") &&
          !item.path.includes("?") && !item.path.includes("#"));
        if (!route) return null;
        const label = id.split(/[-.]/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
        return { id, label, path: route.path as string };
      } catch { return null; }
    }));
    if (sequence !== this.pluginNavigationSequence) return;
    this.pluginNavigationItems = items.filter((item): item is {id:string;label:string;path:string} => item !== null);
    this.syncActiveSectionFromPath();
  }
  isPluginEnabled(pluginId: string): boolean { return this.activePlugins.includes(pluginId); }
  private async refreshTenantPlugins(): Promise<void> {
    if (!this.auth?.accessToken || !this.activeCompanyId) { this.pluginResourceIds = {}; this.setActivePlugins([]); return; }
    try {
      const response = await fetch(this.api + '/marketplace/plugins', { credentials: 'same-origin', headers: { authorization: 'Bearer ' + this.auth.accessToken } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load enabled company plugins');
      const tenantPlugins = Array.isArray(result.plugins) ? result.plugins : [];
      this.pluginResourceIds = Object.fromEntries(tenantPlugins
        .filter((plugin: any) => plugin?.pluginKey && plugin?.id)
        .map((plugin: any) => [String(plugin.pluginKey), String(plugin.id)]));
      const enabledIds = tenantPlugins.filter((plugin: any) => plugin?.installed === true && plugin?.enabled !== false && plugin?.entitled === true).map((plugin: any) => String(plugin.pluginKey || plugin.id || '')).filter(Boolean);
      this.setActivePlugins(enabledIds);
    } catch { this.pluginResourceIds = {}; this.setActivePlugins([]); }
  }
  t(key: string): string { return this.i18n.t(key); }
  get mode(): 'login'|'register'|'forgot' { return this.path === '/register' ? 'register' : this.path === '/forgot' ? 'forgot' : 'login'; }
  get dashboard(): boolean { return this.path === '/dashboard' || this.path.startsWith('/dashboard/'); }
  get signedEmail(): string { return this.auth?.user?.email || 'Workspace user'; }
  get firstName(): string { const name = this.auth?.user?.firstName || this.auth?.user?.first_name || this.auth?.user?.name || this.auth?.user?.displayName || ''; return name.trim().split(/\s+/)[0] || this.signedEmail.split('@')[0].split(/[._-]/)[0] || 'User'; }
  get avatarInitial(): string { return this.firstName.charAt(0).toUpperCase(); }
  get avatarInitials(): string { const name = this.auth?.user?.firstName || this.auth?.user?.first_name || this.auth?.user?.name || this.auth?.user?.displayName || ''; const parts = String(name).trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0) : this.avatarInitial).toUpperCase(); }
  userMenuOpen = false;
  toggleUserMenu(): void { this.userMenuOpen = !this.userMenuOpen; }
  get initial(): string { return this.signedEmail.charAt(0).toUpperCase(); }
  async loadInvitation(): Promise<void> {
    this.invitationToken = new URLSearchParams(window.location.hash.slice(1)).get('token') || new URLSearchParams(window.location.search).get('token') || '';
    this.invitationLoading = true;
    this.invitationError = '';
    if (!this.invitationToken) {
      this.invitationError = 'The invitation link does not contain a token. Ask the organization administrator for a new link.';
      this.invitationLoading = false;
      return;
    }
    try {
      const response = await fetch(this.api + '/auth/invitations/preview', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({token:this.invitationToken}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not validate this invitation');
      this.invitationPreview = result.invitation;
    } catch (error) {
      this.invitationError = error instanceof Error ? error.message : 'Could not validate this invitation';
      this.invitationPreview = null;
    } finally { this.invitationLoading = false; }
  }

  async completeInvitation(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.invitationPreview || !this.invitationToken || this.invitationBusy) return;
    this.invitationError = '';
    if (this.invitationPassword.length < 12) { this.invitationError = 'Use a password with at least 12 characters.'; return; }
    if (!this.invitationExistingAccount && this.invitationPassword !== this.invitationPasswordConfirm) { this.invitationError = 'The passwords do not match.'; return; }
    this.invitationBusy = true;
    try {
      if (this.invitationExistingAccount) {
        const loginResponse = await fetch(this.api + '/auth/login', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({email:this.invitationPreview.email,password:this.invitationPassword,client:'dashboard',...(this.invitationMfaCode?{mfaCode:this.invitationMfaCode}:{})}) });
        const login = await loginResponse.json();
        if (!loginResponse.ok) {
          if (login.mfaRequired) this.invitationMfaRequired = true;
          throw new Error(login.error || 'Sign in failed');
        }
        const acceptResponse = await fetch(this.api + '/invitations/accept', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json',authorization:'Bearer '+login.accessToken}, body:JSON.stringify({token:this.invitationToken}) });
        const accepted = await acceptResponse.json();
        if (!acceptResponse.ok) throw new Error(accepted.error || 'Could not accept invitation');
        this.auth = login;
      } else {
        const registerResponse = await fetch(this.api + '/auth/invitations/register', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({token:this.invitationToken,password:this.invitationPassword}) });
        const registered = await registerResponse.json();
        if (!registerResponse.ok) {
          if (registered.accountExists) this.invitationExistingAccount = true;
          throw new Error(registered.error || 'Could not create your account');
        }
        const loginResponse = await fetch(this.api + '/auth/login', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body:JSON.stringify({email:this.invitationPreview.email,password:this.invitationPassword,client:'dashboard'}) });
        const login = await loginResponse.json();
        if (!loginResponse.ok) throw new Error(login.error || 'Your account was created, but automatic sign-in failed. Please sign in normally.');
        this.auth = login;
      }
      this.templates.setAuthSession(this.auth);
      window.location.assign('/dashboard');
    } catch (error) {
      this.invitationError = error instanceof Error ? error.message : 'Could not complete this invitation';
    } finally { this.invitationBusy = false; }
  }

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
      // The tenant embedded in the authenticated session is authoritative.
      // A stale "active" flag in the companies response must never override it,
      // otherwise tenant-scoped requests (e.g. Teams) are sent for the wrong company.
      const sessionTenantId = this.auth.tenantId || this.auth.user?.tenantId || '';
      const active = sessionTenantId
        ? this.companies.find(company => company.id === sessionTenantId)
        : this.companies.find(company => company.active);
      if (!active) {
        this.activeCompanyId = '';
        this.activeCompanyName = 'Bee workspace';
        this.activeCompanyRole = 'Workspace';
        throw new Error(sessionTenantId
          ? 'The active organization in your session is not available in your company list. Refresh your session or switch organization.'
          : 'No active organization is available for this session.');
      }
      this.activeCompanyId = active.id;
      this.activeCompanyName = active.name;
      this.activeCompanyRole = active.role;
      await this.refreshTenantPlugins();
      // Resolve language using the personal preference or the active team's default.
      await this.i18n.loadPreferences(this.auth.accessToken);
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
    dashboard: '/dashboard', 'connected-devices': '/dashboard/connected-devices', 'time-tracking': '/dashboard/time-tracking/my_jorney', 'time-tracking-day':'/dashboard/time-tracking/my_jorney', 'time-tracking-schedule':'/dashboard/time-tracking/schedule', 'time-tracking-history':'/dashboard/time-tracking/history', 'time-tracking-requests':'/dashboard/time-tracking/requests', plugins: '/dashboard/plugins', organization: '/dashboard/organization', 'organization-company':'/dashboard/organization/company', 'organization-users':'/dashboard/organization/users', 'organization-teams':'/dashboard/organization/teams', 'organization-roles':'/dashboard/organization/roles',
    activity: '/dashboard/activity', mail: '/dashboard/mail', notifications: '/dashboard/notifications', messages: '/dashboard/messages', 'settings-general': '/dashboard/settings/general',
    'settings-tenants': '/dashboard/settings/tenants', 'settings-users': '/dashboard/settings/users', 'settings-roles': '/dashboard/settings/roles-permissions', 'settings-plugins': '/dashboard/settings/plugins',
    'settings-plans': '/dashboard/settings/plans-licensing',
    'settings-security': '/dashboard/settings/security', 'settings-infrastructure': '/dashboard/settings/infrastructure',
    'settings-localization': '/dashboard/settings/localization',
    'themes-dashboard': '/dashboard/themes', 'themes-public': '/dashboard/public-theme',
    branding: '/dashboard/branding', domains: '/dashboard/domains', integrations: '/dashboard/integrations',
    security: '/dashboard/security', system: '/dashboard/system'
  };
  private readonly allSettingsSections = [
    {id:'settings-general',label:'General',icon:'general',description:'Platform name, domain, identity and global configuration.'},
    {id:'settings-tenants',label:'Tenants',icon:'tenants',description:'Tenant directory, company status, subdomains and platform-level controls.'},
    {id:'settings-roles',label:'Roles & Permissions',icon:'roles',description:'Global permission catalogue, system roles and tenant delegation boundaries.'},
    {id:'settings-users',label:'Platform Users',icon:'users',description:'Global user administration and company membership onboarding.'},
    {id:'settings-plugins',label:'Plugins',icon:'plugins',description:'Catalogue, authorization, versions and dependencies.'},
    {id:'settings-plans',label:'Plans & Licensing',icon:'plans',description:'Plans, subscriptions, pricing and licenses.'},
    {id:'settings-security',label:'Security',icon:'security',description:'Global policies, authentication, sessions and audit.'},
    {id:'settings-infrastructure',label:'Infrastructure',icon:'infrastructure',description:'Runtime, storage, queues, logs and services.'},
    {id:'settings-localization',label:'Localization',icon:'localization',description:'Languages, regions, currencies and global formats.'}
  ];
  private syncActiveSectionFromPath(): void {
    if (this.path === '/dashboard/time-tracking' || this.path.startsWith('/dashboard/time-tracking/')) {
      const pathSection = this.path.split('/').filter(Boolean)[2] || 'my_jorney';
      const legacySection = new URLSearchParams(window.location.search).get('section');
      const section = legacySection || pathSection;
      this.activeSection = section === 'schedule' ? 'time-tracking-schedule' : section === 'history' ? 'time-tracking-history' : section === 'requests' ? 'time-tracking-requests' : 'time-tracking-day';
      this.expandedMenuId = 'time-tracking';
      if (!this.isPluginEnabled('time-tracking')) this.activeSection = 'dashboard';
      return;
    }
    if (/^\/dashboard\/plugins\/[^/]+\/details\/?$/.test(this.path)) { this.activeSection = 'settings-plugins'; this.expandedMenuId = 'settings'; return; }
    if (this.path.startsWith('/dashboard/settings/tenants/') && this.path.endsWith('/manage')) {
      this.activeSection = 'settings-tenants';
      this.expandedMenuId = 'settings';
      return;
    }
    if (this.path === '/dashboard/settings' || this.path === '/dashboard/settings/') {
      this.activeSection = this.settingsNavigationItems.some(item => item.id === 'settings-general')
        ? 'settings-general' : (this.settingsNavigationItems[0]?.id || 'dashboard');
      this.expandedMenuId = 'settings';
      return;
    }
    if (this.path === '/dashboard/organization' || this.path === '/dashboard/organization/') {
      this.activeSection = 'organization-company';
      this.expandedMenuId = 'organization';
      return;
    }
    const entry = Object.entries(this.sectionRoutes).find(([, route]) => route === this.path);
    const dynamicPlugin = this.pluginNavigationItems.find(item => item.path === this.path);
    const nextSection = entry?.[0] || dynamicPlugin?.id || 'dashboard';
    this.activeSection = (nextSection.startsWith('settings-') && !this.settingsNavigationItems.some(item => item.id === nextSection)) || (nextSection === 'connected-devices' && !this.isPluginEnabled('connected-devices'))
      ? 'dashboard'
      : nextSection;
    this.expandedMenuId = this.activeSection.startsWith('settings-') ? 'settings' : (['notifications','messages','mail'].includes(this.activeSection) ? 'notifications' : this.activeSection.startsWith('organization-') ? 'organization' : '');
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
  get canManagePlugins(): boolean { return this.isPlatformAdmin || ['super_admin','owner','admin'].includes((this.activeCompanyRole || '').toLowerCase()); }
  get canManageAppearance(): boolean { return this.isPlatformAdmin || ['owner','admin'].includes((this.activeCompanyRole || '').toLowerCase()); }
  get sectionTitle(): string { const organizationTitles: Record<string,string> = {'organization-company':'nav.organization.company','organization-users':'nav.organization.users','organization-teams':'nav.organization.teams','organization-roles':'nav.organization.roles'}; const timeTrackingTitles: Record<string,string> = {'time-tracking-day':'nav.timeTracking','time-tracking-schedule':'nav.timeTracking','time-tracking-history':'nav.timeTracking','time-tracking-requests':'nav.timeTracking'}; const externalPlugin = this.pluginNavigationItems.find(item => item.id === this.activeSection); if (externalPlugin) return externalPlugin.label; const key=timeTrackingTitles[this.activeSection] || organizationTitles[this.activeSection] || (this.activeSection === 'notifications' ? 'nav.notifications' : this.activeSection === 'messages' ? 'nav.notifications.chat' : this.settingsNavigationItems.find(item => item.id === this.activeSection)?.labelKey || this.navigationItems.find(item => item.id === this.activeSection)?.labelKey || 'nav.dashboard'); return this.i18n.t(key); }
  get settingsNavigationItems(): Array<{id:string;label:string;labelKey:string;icon:string;description:string}> {
    const role = (this.activeCompanyRole || '').toLowerCase();
    const allowed = this.isPlatformAdmin
      ? this.allSettingsSections.map(item => item.id)
      : ['owner','admin'].includes(role)
        ? ['settings-general','settings-plugins','settings-security','settings-localization']
        : ['settings-localization'];
    return this.allSettingsSections.filter(item => allowed.includes(item.id)).map(item => ({
      ...item,
      labelKey: 'settings:section.' + item.id.replace('settings-',''),
      label: this.i18n.t('settings:section.' + item.id.replace('settings-','')),
      description: this.i18n.t('settings:section.' + item.id.replace('settings-','') + '.description')
    }));
  }
  get settingsComponentSection(): string {
    return this.activeSection.replace('settings-', '') === 'plans' ? 'plans' : this.activeSection.replace('settings-', '');
  }
  get settingsSectionTitle(): string { return this.settingsNavigationItems.find(item => item.id === this.activeSection)?.label || 'Settings'; }
  get settingsSectionDescription(): string { return this.settingsNavigationItems.find(item => item.id === this.activeSection)?.description || 'Manage your workspace preferences.'; }
  toggleNavigationMenu(menuId: string): void {
    if (this.expandedMenuId === menuId) {
      this.expandedMenuId = '';
      return;
    }
    this.expandedMenuId = menuId;
    const defaults: Record<string, string> = {
      settings: 'settings-general',
      notifications: 'notifications',
      organization: 'organization-company',
      'time-tracking': 'time-tracking-day'
    };
    const target = defaults[menuId];
    if (!target) return;
    if (menuId === 'settings' && !this.settingsNavigationItems.some(item => item.id === target)) {
      const firstAvailable = this.settingsNavigationItems[0];
      if (firstAvailable) this.navigateSection(firstAvailable.id);
      return;
    }
    this.navigateSection(target);
  }
  get canManageTimeTracking(): boolean { return ['owner','admin','manager','super_admin','superadmin'].includes((this.activeCompanyRole || '').toLowerCase()); }
  get canReadActivity(): boolean {
    // Keep navigation visibility aligned with AuditLogComponent.canRead.
    return ['owner','admin'].includes((this.activeCompanyRole || '').toLowerCase());
  }
  get navigationItems(): Array<{id:string;label:string;labelKey:string;icon:string;group:string}> {
    // One shared navigation structure for platform and tenant administrators.
    // Privileged areas are restricted within Settings and by section access checks.
    const items = [
      {id:'dashboard',label:this.i18n.t('nav.dashboard'),labelKey:'nav.dashboard',icon:'dashboard',group:'WORKSPACE'},
      ...this.pluginNavigationItems.map(item => ({id:item.id,label:item.label,labelKey:'nav.plugin.' + item.id,icon:'plugins',group:'WORKSPACE'})),
      ...(this.isPluginEnabled('connected-devices') ? [{id:'connected-devices',label:this.i18n.t('nav.connectedDevices'),labelKey:'nav.connectedDevices',icon:'infrastructure',group:'WORKSPACE'}] : []),
      ...(this.isPluginEnabled('time-tracking') ? [{id:'time-tracking',label:'Control Horario',labelKey:'nav.timeTracking',icon:'activity',group:'WORKSPACE'}] : []),
      {id:'organization',label:this.i18n.t('nav.organization'),labelKey:'nav.organization',icon:'organization',group:'WORKSPACE'},
      {id:'activity',label:this.i18n.t('nav.activity'),labelKey:'nav.activity',icon:'activity',group:'WORKSPACE'},
      {id:'mail',label:this.i18n.t('nav.mail'),labelKey:'nav.mail',icon:'mail',group:'WORKSPACE'},
      {id:'notifications',label:this.i18n.t('nav.notifications'),labelKey:'nav.notifications',icon:'notifications',group:'WORKSPACE'},
      {id:'settings',label:this.i18n.t('nav.settings'),labelKey:'nav.settings',icon:'settings',group:'SYSTEM'}
    ];
    return items.filter(item => item.id !== 'activity' || this.canReadActivity);
  }
  get visibleMenuGroups(): string[] { return [...new Set(this.navigationItems.map(item => item.group))]; }
  navigateSection(id: string): void {
    const targetId = id === 'settings' ? (this.settingsNavigationItems.some(item => item.id === 'settings-general') ? 'settings-general' : this.settingsNavigationItems[0]?.id) : id === 'organization' ? 'organization-company' : id;
    if (!targetId) return;
    if (targetId.startsWith('settings-') && !this.settingsNavigationItems.some(item => item.id === targetId)) return;
    if (targetId === 'connected-devices' && !this.isPluginEnabled('connected-devices')) { this.navigateSection('dashboard'); return; }
    if (targetId === 'time-tracking' && !this.isPluginEnabled('time-tracking')) { this.navigateSection('dashboard'); return; }
    const route = this.sectionRoutes[targetId] || this.pluginNavigationItems.find(item => item.id === targetId)?.path;
    if (!route) return;
    const targetPath = route.split('?')[0];
    if (window.location.pathname + window.location.search !== route) window.history.pushState({}, '', route);
    this.path = targetPath;
    this.activeSection = targetId;
    this.expandedMenuId = targetId.startsWith('settings-') ? 'settings' : (['notifications','messages','mail'].includes(targetId) ? 'notifications' : targetId.startsWith('organization-') ? 'organization' : targetId.startsWith('time-tracking-') ? 'time-tracking' : '');
    this.menuOpen = false;
  }

  bars = [30,52,44,67,46,80,60,92,56,72,48,85,62,95,54,74,40,63,80,47,70,98,56,72];
}