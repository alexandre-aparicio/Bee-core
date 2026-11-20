import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateManagerComponent } from './templates/template-manager.component';
import { BeeTemplateEngine } from './templates/template-engine.service';
import { BeeTemplateSlotComponent } from './templates/template-slot.component';

@Component({ selector: 'bee-root', standalone: true, imports: [CommonModule, FormsModule, BeeTemplateManagerComponent, BeeTemplateSlotComponent], templateUrl: './app.component.html' })
export class AppComponent implements OnInit {
  constructor(private readonly templates: BeeTemplateEngine) {}

  ngOnInit(): void { if (this.dashboard && this.auth?.accessToken) void this.loadCompanies(); }

  layoutId(target: 'public' | 'dashboard'): string { return this.templates.getActive(target).layout; }
  layoutClass(target: 'public' | 'dashboard'): string { return 'bee-layout--' + this.layoutId(target).replace('.', '-'); }

  path = window.location.pathname;
  menuOpen = false;
  email = ''; password = ''; reveal = false; busy = false; error = '';
  auth: any = this.readSession();
  api = '/api';
  companies: Array<{id:string;name:string;role:string;active:boolean}> = [];
  activeCompanyId = '';
  activeCompanyName = 'Bee workspace';
  activeCompanyRole = 'Workspace';
  companyError = '';
  companyBusy = false;
  get mode(): 'login'|'register'|'forgot' { return this.path === '/register' ? 'register' : this.path === '/forgot' ? 'forgot' : 'login'; }
  get dashboard(): boolean { return this.path === '/dashboard'; }
  get signedEmail(): string { return this.auth?.user?.email || 'Workspace user'; }
  get initial(): string { return this.signedEmail.charAt(0).toUpperCase(); }
  private readSession(): any { try { return JSON.parse(localStorage.getItem('bee-auth') || 'null'); } catch { return null; } }
  async signIn(e: Event): Promise<void> { e.preventDefault(); this.error = ''; if (this.mode !== 'login') { this.error = this.mode === 'register' ? 'Self-registration is not enabled yet. Contact your workspace administrator.' : 'Password recovery is not configured yet. Contact your workspace administrator.'; return; } this.busy = true; try { const response = await fetch(this.api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: this.email, password: this.password, client: 'dashboard' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Login failed'); localStorage.setItem('bee-auth', JSON.stringify(result)); window.location.assign('/dashboard'); } catch (err) { this.error = err instanceof Error ? err.message : 'Sign in failed'; } finally { this.busy = false; } }
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
  bars = [30,52,44,67,46,80,60,92,56,72,48,85,62,95,54,74,40,63,80,47,70,98,56,72];
}