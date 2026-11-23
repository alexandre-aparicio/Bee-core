import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type CompanyMember = { userId: string; email: string | null; role: string; customRoleId?: string | null; restrictionRoleIds?: string[]; status: "active" | "suspended"; createdAt: string };
type CustomRole = { id: string; name: string; description: string; permissions: string[]; mode?: "grant" | "restriction" };
type CompanyInvitation = { id: string; email: string; role: string; customRoleId?: string | null; restrictionRoleIds?: string[]; createdAt: string; expiresAt: string; acceptedAt: string | null; cancelledAt: string | null; status?: "pending" | "accepted" | "cancelled" | "expired" };

@Component({
  selector: "bee-company-members",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="users" class="panel bee-dashboard-card bee-company-members">
      <div class="panel-heading">
        <div><h2>{{canRead ? "Organization members" : "Join an organization"}}</h2><p>{{canRead ? "Memberships and roles apply only to the active organization." : "Select an invitation link to join an organization."}}</p></div>
        <button class="bee-company-members__refresh" type="button" (click)="load()" [disabled]="loading">Refresh</button>
      </div>
      <div *ngIf="canRead && loading" class="bee-company-members__state">Loading members…</div>
      <div *ngIf="error" class="bee-company-members__error" role="alert">{{error}}</div>
      <div *ngIf="message" class="bee-company-members__message" role="status">{{message}}</div>
      <div class="bee-company-members__table-wrap" *ngIf="canRead && !loading && members.length">
        <table class="bee-company-members__table">
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th *ngIf="canManage">Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let member of members; trackBy: trackMember">
              <td><strong>{{member.email || 'Member'}}</strong></td>
              <td>
                <select *ngIf="canManage && member.role !== 'owner' && member.role !== 'super_admin' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')" [value]="member.role === 'custom' ? 'custom:' + member.customRoleId : member.role" (change)="changeRole(member, $any($event.target).value)" [disabled]="busyId === member.userId">
                  <option value="guest">Guest</option><option value="member">Member</option><option value="manager">Manager</option><option *ngIf="canAssignOwner" value="owner">Owner</option>
                  <option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">Admin</option>
                  <option *ngFor="let customRole of grantRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option>
                </select>
                <span *ngIf="!canManage || member.role === 'owner' || member.role === 'super_admin' || (member.role === 'admin' && role !== 'owner' && role !== 'super_admin')">{{member.role === 'super_admin' ? 'Super Admin' : (member.role === 'custom' ? customRoleName(member.customRoleId) : member.role)}}</span>
                <div *ngIf="canManageCustomRoles && member.role !== 'owner' && member.role !== 'super_admin' && restrictionRoles.length" class="bee-company-members__restrictions"><small>Additional restrictions</small><label *ngFor="let restriction of restrictionRoles"><input type="checkbox" [checked]="(member.restrictionRoleIds || []).includes(restriction.id)" (change)="toggleRestriction(member,restriction.id,$any($event.target).checked)" [disabled]="busyId === member.userId"> {{restriction.name}}</label></div>
              </td>
              <td><span class="bee-company-members__status" [class.is-suspended]="member.status !== 'active'">{{member.status}}</span></td>
              <td *ngIf="canManage"><div class="bee-company-members__invitation-menu-wrap bee-company-members__member-menu-wrap" *ngIf="member.role !== 'owner' && member.role !== 'super_admin' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')"><button type="button" class="bee-company-members__invitation-menu-trigger" [attr.aria-label]="'Member options for ' + (member.email || 'member')" [attr.aria-expanded]="openMemberMenuId === member.userId" (click)="toggleMemberMenu(member.userId)">⋮</button><div *ngIf="openMemberMenuId === member.userId" class="bee-company-members__invitation-menu"><button type="button" disabled>Edit member</button><button type="button" disabled>Reset password</button><button type="button" class="is-danger" *ngIf="member.status === 'active'" (click)="setMemberStatus(member, 'suspended')" [disabled]="busyId === member.userId">Suspend</button><button type="button" *ngIf="member.status === 'suspended'" (click)="setMemberStatus(member, 'active')" [disabled]="busyId === member.userId">Activate</button></div></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="canRead && !loading && !members.length" class="bee-company-members__state">No members found.</div>

      <div *ngIf="canInvite" class="bee-company-members__invite">
        <h3>Invite a colleague</h3>
        <form (submit)="invite($event)">
          <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" placeholder="colleague@company.com" required>
          <select name="inviteRole" [(ngModel)]="inviteRole"><option value="guest">Guest</option><option value="member">Member</option><option value="manager">Manager</option><option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">Admin</option><option *ngFor="let customRole of grantRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option></select>
          <div *ngIf="canManageCustomRoles && restrictionRoles.length" class="bee-company-members__restrictions"><small>Additional restrictions</small><label *ngFor="let restriction of restrictionRoles"><input type="checkbox" [checked]="inviteRestrictionRoleIds.includes(restriction.id)" (change)="toggleInviteRestriction(restriction.id,$any($event.target).checked)"> {{restriction.name}}</label></div>
          <button type="submit" [disabled]="busyId === 'invite' || !inviteEmail.trim()">{{busyId === 'invite' ? 'Creating…' : 'Create invitation'}}</button>
        </form>
        <div *ngIf="acceptanceLink" class="bee-company-members__token">
          <strong>Invitation link ready to share</strong>
          <input type="url" [value]="acceptanceLink" readonly aria-label="Invitation link">
          <button type="button" (click)="copyLink()">Copy invitation link</button>
          <small>Send this link to the invited person. They can open it in any browser to create an account or sign in. It expires in seven days and can only be used once.</small>
        </div>
      </div>

      <div *ngIf="canInvite && invitations.length" class="bee-company-members__invitations">
        <h3>Invitations</h3>
        <div class="bee-company-members__invitation-grid">
          <article class="bee-company-members__invitation-card" *ngFor="let invitation of invitations; trackBy: trackInvitation">
            <div class="bee-company-members__invitation-card-head">
              <span class="bee-company-members__invitation-role">{{invitation.role === 'custom' ? customRoleName(invitation.customRoleId) : invitation.role}}</span>
              <div class="bee-company-members__invitation-menu-wrap">
                <button type="button" class="bee-company-members__invitation-menu-trigger" [attr.aria-label]="'Invitation options for ' + invitation.email" [attr.aria-expanded]="openInvitationMenuId === invitation.id" (click)="toggleInvitationMenu(invitation.id)">⋮</button>
                <div *ngIf="openInvitationMenuId === invitation.id" class="bee-company-members__invitation-menu">
                  <button type="button" disabled>Edit invitation</button>
                  <button type="button" disabled>Resend invitation</button>
                  <button type="button" class="is-danger" (click)="cancelInvitation(invitation)" [disabled]="busyId === invitation.id || invitation.acceptedAt || invitation.cancelledAt || invitation.status === 'expired'">Revoke invitation</button>
                </div>
              </div>
            </div>
            <strong class="bee-company-members__invitation-email">{{invitation.email}}</strong>
            <small class="bee-company-members__invitation-date">Expires {{invitation.expiresAt | date:'mediumDate'}}</small>
            <span class="bee-company-members__status" [class.is-suspended]="invitationState(invitation) !== 'pending'" [class.is-revoked]="invitationState(invitation) === 'revoked'">{{invitationState(invitation)}}</span>
          </article>
        </div>
      </div>
    </section>
  `
})
export class CompanyMembersComponent implements OnInit, OnChanges {
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  @Output() membershipChanged = new EventEmitter<void>();
  members: CompanyMember[] = [];
  invitations: CompanyInvitation[] = [];
  customRoles: CustomRole[] = [];
  effectivePermissions: string[] = [];
  permissionsLoaded = false;
  canAssignOwner = false;
  get restrictionRoles(): CustomRole[] { return this.customRoles.filter(item => item.mode === "restriction"); }
  get grantRoles(): CustomRole[] { return this.customRoles.filter(item => item.mode !== "restriction"); }
  inviteEmail = "";
  inviteRole = "member";
  inviteRestrictionRoleIds: string[] = [];
  acceptanceLink = "";
  openInvitationMenuId = "";
  openMemberMenuId = "";
  loading = false;
  private requestSequence = 0;
  busyId = "";
  error = "";
  message = "";

  get canRead(): boolean { return this.permissionsLoaded ? this.effectivePermissions.includes("members.read") : this.role === "super_admin" || this.role === "owner" || this.role === "admin" || this.role === "manager" || this.role === "member"; }
  get canManage(): boolean { return this.permissionsLoaded ? this.effectivePermissions.includes("members.manage") : this.role === "super_admin" || this.role === "owner" || this.role === "admin"; }
  get canInvite(): boolean { return this.permissionsLoaded ? this.effectivePermissions.includes("members.invite") : this.role === "super_admin" || this.role === "owner" || this.role === "admin"; }
  get canManageCustomRoles(): boolean { return (this.role === "super_admin" || this.role === "owner") && this.canManage; }

  ngOnInit(): void { void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes["tenantId"] || changes["role"]) && !changes["tenantId"]?.firstChange) {
      this.requestSequence++;
      this.members = [];
      this.invitations = [];
      this.customRoles = [];
      this.effectivePermissions = [];
      this.permissionsLoaded = false;
      this.canAssignOwner = false;
      this.loading = false;
      this.error = "";
      this.message = "";
      this.acceptanceLink = "";
      if (this.tenantId && this.token) void this.load();
    }
  }

  trackMember(_index: number, member: CompanyMember): string { return member.userId; }
  trackInvitation(_index: number, invitation: CompanyInvitation): string { return invitation.id; }
  invitationState(invitation: CompanyInvitation): "pending" | "accepted" | "revoked" | "expired" { return invitation.acceptedAt ? "accepted" : invitation.cancelledAt || invitation.status === "cancelled" ? "revoked" : invitation.status === "expired" || new Date(invitation.expiresAt).getTime() <= Date.now() ? "expired" : "pending"; }
  toggleInvitationMenu(id: string): void { this.openInvitationMenuId = this.openInvitationMenuId === id ? "" : id; }
  toggleMemberMenu(id: string): void { this.openMemberMenuId = this.openMemberMenuId === id ? "" : id; }
  trackCustomRole(_index:number, role:CustomRole):string { return role.id; }
  customRoleName(roleId?:string|null):string { return this.customRoles.find(item=>item.id===roleId)?.name || "Custom role"; }

  private get token(): string { return this.accessToken; }

  private async request(path: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch("/api" + path, {
      method,
      headers: { authorization: "Bearer " + this.token, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Company member request failed");
    return result;
  }

  async load(): Promise<void> {
    if (!this.tenantId || !this.token) return;
    const requestId = ++this.requestSequence;
    const requestedTenantId = this.tenantId;
    const requestedRole = this.role;
    const isCurrentRequest = () => requestId === this.requestSequence
      && requestedTenantId === this.tenantId
      && requestedRole === this.role;
    this.loading = true;
    this.error = "";
    try {
      const access = await this.request("/companies/active/permissions");
      if (!isCurrentRequest()) return;
      this.effectivePermissions = Array.isArray(access.permissions) ? access.permissions : [];
      this.permissionsLoaded = true;
      if (!this.canRead) { this.members = []; this.invitations = []; this.customRoles = []; return; }
      const result = await this.request("/companies/" + encodeURIComponent(requestedTenantId) + "/memberships");
      if (!isCurrentRequest()) return;
      this.canAssignOwner = !!result.canAssignOwner;
      this.members = result.memberships || [];
      if (this.canInvite) {
        const pending = await this.request("/companies/" + encodeURIComponent(requestedTenantId) + "/invitations");
        if (!isCurrentRequest()) return;
        this.invitations = pending.invitations || [];
      } else {
        this.invitations = [];
      }
      if (this.canManageCustomRoles) {
        const roles = await this.request("/companies/" + encodeURIComponent(requestedTenantId) + "/roles");
        if (!isCurrentRequest()) return;
        this.customRoles = roles.roles || [];
      } else {
        this.customRoles = [];
      }
    } catch (error) {
      if (isCurrentRequest()) this.error = error instanceof Error ? error.message : "Could not load company members";
    } finally {
      if (isCurrentRequest()) this.loading = false;
    }
  }

  async invite(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.tenantId || !this.inviteEmail.trim() || this.busyId) return;
    this.busyId = "invite";
    this.error = "";
    this.message = "";
    this.acceptanceLink = "";
    try {
      const customRoleId = this.inviteRole.startsWith("custom:") ? this.inviteRole.slice("custom:".length) : "";
      const payload = { email: this.inviteEmail.trim(), role: customRoleId ? "custom" : this.inviteRole, ...(customRoleId ? { customRoleId } : {}), ...(this.inviteRestrictionRoleIds.length ? { restrictionRoleIds: this.inviteRestrictionRoleIds } : {}) };
      const result = await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/invitations", "POST", payload);
      const token = String(result.acceptanceToken || "");
      this.acceptanceLink = token ? window.location.origin + "/invite/accept#token=" + encodeURIComponent(token) : "";
      this.inviteEmail = "";
      this.inviteRole = "member";
      this.inviteRestrictionRoleIds = [];
      this.message = "Invitation created. Copy the link and share it with the invited person.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not create invitation";
    } finally {
      this.busyId = "";
    }
  }

  toggleInviteRestriction(roleId: string, checked: boolean): void {
    const selected = new Set(this.inviteRestrictionRoleIds);
    if (checked) selected.add(roleId); else selected.delete(roleId);
    this.inviteRestrictionRoleIds = [...selected];
  }

  async copyLink(): Promise<void> {
    if (!this.acceptanceLink) return;
    try { await navigator.clipboard.writeText(this.acceptanceLink); this.message = "Invitation link copied. Share it with the invited person."; }
    catch { this.error = "Clipboard access is unavailable. Select and copy the invitation link manually."; }
  }

  async changeRole(member: CompanyMember, role: string): Promise<void> {
    const customRoleId = role.startsWith("custom:") ? role.slice("custom:".length) : "";
    if (customRoleId ? (!this.canManageCustomRoles || !this.customRoles.some(item => item.id === customRoleId && item.mode !== "restriction")) : !(["admin", "manager", "member", "guest"].includes(role) || (role === "owner" && this.canAssignOwner))) return;
    this.busyId = member.userId;
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships/" + encodeURIComponent(member.userId), "PUT", customRoleId ? { customRoleId } : { role });
      this.message = "Membership role updated. The member must sign in again.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not update role";
    } finally { this.busyId = ""; }
  }

  async toggleRestriction(member: CompanyMember, restrictionRoleId: string, checked: boolean): Promise<void> {
    if (!this.canManageCustomRoles || member.role === "owner" || member.role === "super_admin" || this.busyId) return;
    const current = new Set(member.restrictionRoleIds || []);
    if (checked) current.add(restrictionRoleId); else current.delete(restrictionRoleId);
    this.busyId = member.userId;
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships/" + encodeURIComponent(member.userId), "PUT", { restrictionRoleIds: [...current] });
      this.message = "Restriction updated. The member's active sessions were revoked.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not update restrictions";
    } finally { this.busyId = ""; }
  }

  async setMemberStatus(member: CompanyMember, status: "active" | "suspended"): Promise<void> {
    if (this.busyId || member.role === "owner" || member.role === "super_admin") return;
    this.busyId = member.userId;
    this.openMemberMenuId = "";
    this.error = "";
    this.message = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships/" + encodeURIComponent(member.userId) + "/status", "PATCH", { status });
      this.message = status === "suspended" ? "Membership suspended and active sessions revoked." : "Membership reactivated and active sessions revoked.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : (status === "suspended" ? "Could not suspend member" : "Could not reactivate member");
    } finally {
      this.busyId = "";
    }
  }

  async cancelInvitation(invitation: CompanyInvitation): Promise<void> {
    this.busyId = invitation.id;
    this.openInvitationMenuId = "";
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/invitations/" + encodeURIComponent(invitation.id), "DELETE");
      this.message = "Invitation revoked.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not cancel invitation";
    } finally { this.busyId = ""; }
  }
}
