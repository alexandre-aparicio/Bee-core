import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BeeTemplateManagerComponent } from './templates/template-manager.component';
import { BeeTemplateOutletComponent } from './templates/template-outlet.component';

@Component({ selector: 'bee-root', standalone: true, imports: [CommonModule, FormsModule, BeeTemplateManagerComponent, BeeTemplateOutletComponent], templateUrl: './app.component.html' })
export class AppComponent {
  path = window.location.pathname;
  menuOpen = false;
  email = ''; password = ''; reveal = false; busy = false; error = '';
  auth: any = this.readSession();
  api = '/api';
  get mode(): 'login'|'register'|'forgot' { return this.path === '/register' ? 'register' : this.path === '/forgot' ? 'forgot' : 'login'; }
  get dashboard(): boolean { return this.path === '/dashboard'; }
  get signedEmail(): string { return this.auth?.user?.email || 'Workspace user'; }
  get initial(): string { return this.signedEmail.charAt(0).toUpperCase(); }
  private readSession(): any { try { return JSON.parse(localStorage.getItem('bee-auth') || 'null'); } catch { return null; } }
  async signIn(e: Event): Promise<void> { e.preventDefault(); this.error = ''; if (this.mode !== 'login') { this.error = this.mode === 'register' ? 'Self-registration is not enabled yet. Contact your workspace administrator.' : 'Password recovery is not configured yet. Contact your workspace administrator.'; return; } this.busy = true; try { const response = await fetch(this.api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: this.email, password: this.password, client: 'dashboard' }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Login failed'); localStorage.setItem('bee-auth', JSON.stringify(result)); window.location.assign('/dashboard'); } catch (err) { this.error = err instanceof Error ? err.message : 'Sign in failed'; } finally { this.busy = false; } }
  logout(): void { localStorage.removeItem('bee-auth'); window.location.assign('/login'); }
  toggleMenu(): void { this.menuOpen = !this.menuOpen; }
  bars = [30,52,44,67,46,80,60,92,56,72,48,85,62,95,54,74,40,63,80,47,70,98,56,72];
}