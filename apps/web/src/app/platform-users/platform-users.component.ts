import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'bee-platform-users',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="platform-users">
      <header class="platform-users__header">
        <div><span class="platform-users__eyebrow">PLATFORM ADMINISTRATION</span><h2>Users</h2><p>Global user administration across Bee-Core. Company owners continue to manage their own members in Organization → Users.</p></div>
      </header>
      <div class="platform-users__scope"><strong>Superadmin access</strong><span>This area is available to platform superadministrators only. Company Owner, Admin, Manager and Employee accounts do not receive global user administration.</span></div>
      <div class="platform-users__cards">
        <article class="platform-users__card">
          <span class="platform-users__number">01</span><h3>Create user</h3><p>Create a user account centrally and associate it with an authorized company membership.</p>
          <ul><li>Email and name</li><li>Company membership</li><li>User type and role</li><li>Temporary password</li></ul>
          <span class="platform-users__future">Future · Not connected</span>
        </article>
        <article class="platform-users__card">
          <span class="platform-users__number">02</span><h3>Invite by email</h3><p>Send a time-limited invitation so the recipient registers and chooses their own password.</p>
          <ul><li>Invitation link with secure token</li><li>Expiry and single use</li><li>Registration and password creation</li><li>Revoke or resend invitation</li></ul>
          <span class="platform-users__future">Future · Email flow not connected</span>
        </article>
      </div>
      <section class="platform-users__types"><h3>Company user types</h3><div class="platform-users__type-grid"><article><strong>Owner</strong><small>Company ownership and member administration</small></article><article><strong>Admin</strong><small>Company administration by assigned permissions</small></article><article><strong>Manager</strong><small>Team management as permitted</small></article><article><strong>Employee</strong><small>Standard company account</small></article><article><strong>Guest / External</strong><small>Limited access; proposed type</small></article><article><strong>Superadmin</strong><small>Platform-level account, not a company membership</small></article></div></section>
      <p class="platform-users__note">These panels document the planned flows only. They do not create users, send email, issue credentials or register invitations yet.</p>
    </section>
  `,
  styles: [`
    .platform-users{display:grid;gap:20px;color:inherit}
    .platform-users__header h2{margin:6px 0;font-size:26px}
    .platform-users__header p{margin:0;max-width:700px;color:var(--bee-text-muted);line-height:1.65}
    .platform-users__eyebrow{font-size:10px;letter-spacing:.14em;font-weight:700;opacity:.7}
    .platform-users__scope{display:flex;flex-direction:column;gap:5px;padding:15px 17px;border:1px solid color-mix(in srgb,var(--bee-border) 20%,transparent);border-radius:14px;background:color-mix(in srgb,var(--bee-surface-subtle) 4%,transparent)}
    .platform-users__scope span{font-size:13px;line-height:1.6;opacity:.8}
    .platform-users__cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .platform-users__card{padding:20px;border:1px solid color-mix(in srgb,var(--bee-border) 18%,transparent);border-radius:16px;background:color-mix(in srgb,var(--bee-surface-subtle) 3%,transparent);display:flex;flex-direction:column;align-items:flex-start;gap:10px}
    .platform-users__number{font-size:11px;letter-spacing:.12em;opacity:.6}
    .platform-users__card h3{margin:0;font-size:18px}
    .platform-users__card p{margin:0;line-height:1.6;opacity:.8}
    .platform-users__card ul{margin:0;padding-left:18px;line-height:1.8;opacity:.85}
    .platform-users__future{margin-top:auto;display:inline-flex;padding:6px 9px;border-radius:99px;background:color-mix(in srgb,var(--bee-border) 9%,transparent);font-size:11px;font-weight:650}
    .platform-users__types h3{margin:0 0 12px}
    .platform-users__type-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .platform-users__type-grid article{display:flex;flex-direction:column;gap:5px;padding:13px;border:1px solid color-mix(in srgb,var(--bee-border) 17%,transparent);border-radius:12px}
    .platform-users__type-grid small{line-height:1.5;opacity:.75}
    .platform-users__note{padding:12px 14px;border-left:3px solid color-mix(in srgb,var(--bee-border-strong) 40%,transparent);line-height:1.6;opacity:.8}
    @media(max-width:760px){.platform-users__cards,.platform-users__type-grid{grid-template-columns:1fr}}
  `]
})
export class PlatformUsersComponent {}
