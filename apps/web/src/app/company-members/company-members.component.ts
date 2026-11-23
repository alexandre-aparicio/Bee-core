import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type CompanyMember = { userId: string; email: string | null; role: string; customRoleId?: string | null; restrictionRoleIds?: string[]; status: "active" | "suspended"; createdAt: string };
type CustomRole = { id: string; name: string; description: string; permissions: string[]; mode?: "grant" | "restriction" };
type CompanyInvitation = { id: string; email: string; role: string; createdAt: string; expiresAt: string; acceptedAt: string | null; cancelledAt: string | null };

@Component({
  selector: "bee-company-members",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="users" class="panel bee-dashboard-card bee-company-members">
      <div class="panel-heading">
        <div><h2>{{canRead ? "Organization members" : "Join an organization"}}</h2><p>{{canRead ? "Memberships and roles apply only to the active organization." : "Have an invitation token? Accept it to join another company."}}</p></div>
        <button class="bee-company-members__refresh" type="button" (click)="load()" [disabled]="loading">Refresh</button>
      </div>
      <div class="bee-company-members__accept">
        <form (submit)="acceptInvitation($event)">
          <input type="text" name="acceptInvitationToken" [(ngModel)]="inviteTokenInput" placeholder="Paste a company invitation token">
          <button type="submit" [disabled]="busyId === 'accept' || !inviteTokenInput.trim()">{{busyId === 'accept' ? 'Joining…' : 'Accept invitation'}}</button>
        </form>
      </div>
      <div *ngIf="canRead && loading" class="bee-company-members__state">Loading members…</div>
      <div *ngIf="error" class="bee-company-members__error" role="alert">{{error}}</div>
      <div *ngIf="message" class="bee-company-members__message" role="status">{{message}}</div>
      <div class="bee-company-members__table-wrap" *ngIf="canRead && !loading && members.length">
        <table class="bee-company-members__table">
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th *ngIf="canManage">Actions</th></tr></thead>
          <tbody>
            <tr *ngFor="let member of members; trackBy: trackMember">
              <td><strong>{{member.email || member.userId}}</strong><small>{{member.userId}}</small></td>
              <td>
                <select *ngIf="canManage && member.role !== 'owner' && member.role !== 'super_admin' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')" [value]="member.role === 'custom' ? 'custom:' + member.customRoleId : member.role" (change)="changeRole(member, $any($event.target).value)" [disabled]="busyId === member.userId">
                  <option value="guest">Guest</option><option value="member">Member</option><option value="manager">Manager</option><option *ngIf="canAssignOwner" value="owner">Owner</option>
                  <option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">Admin</option>
                  <option *ngFor="let customRole of grantRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option>
                </select>
                <span *ngIf="!canManage || member.role === 'owner' || member.role === 'super_admin'">{{member.role === 'super_admin' ? 'Super Admin' : (member.role === 'custom' ? customRoleName(member.customRoleId) : member.role)}}</span>
                <div *ngIf="canManageCustomRoles && member.role !== 'owner' && member.role !== 'super_admin' && restrictionRoles.length" class="bee-company-members__restrictions"><small>Additional restrictions</small><label *ngFor="let restriction of restrictionRoles"><input type="checkbox" [checked]="(member.restrictionRoleIds || []).includes(restriction.id)" (change)="toggleRestriction(member,restriction.id,$any($event.target).checked)" [disabled]="busyId === member.userId"> {{restriction.name}}</label></div>
              </td>
              <td><span class="bee-company-members__status" [class.is-suspended]="member.status !== 'active'">{{member.status}}</span></td>
              <td *ngIf="canManage"><button *ngIf="member.role !== 'owner' && member.role !== 'super_admin' && member.status === 'active' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')" class="bee-company-members__danger" type="button" (click)="suspend(member)" [disabled]="busyId === member.userId">Suspend</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="canRead && !loading && !members.length" class="bee-company-members__state">No members found.</div>

      <div *ngIf="canInvite" class="bee-company-members__invite">
        <h3>Invite a colleague</h3>
        <form (submit)="invite($event)">
          <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" placeholder="colleague@company.com" required>
          <select name="inviteRole" [(ngModel)]="inviteRole"><option value="guest">Guest</option><option value="member">Member</option><option value="manager">Manager</option><option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">Admin</option></select>
          <button type="submit" [disabled]="busyId === 'invite' || !inviteEmail.trim()">{{busyId === 'invite' ? 'Creating…' : 'Create invitation'}}</button>
        </form>
        <div *ngIf="acceptanceToken" class="bee-company-members__token">
          <strong>One-time invitation token</strong>
          <code>{{acceptanceToken}}</code>
          <button type="button" (click)="copyToken()">Copy token</button>
          <small>Share this token securely with the invited user. It expires in seven days and is shown only once.</small>
        </div>
      </div>

      <div *ngIf="canInvite && invitations.length" class="bee-company-members__invitations">
        <h3>Invitations</h3>
        <div class="bee-company-members__invitation" *ngFor="let invitation of invitations; trackBy: trackInvitation">
          <span><strong>{{invitation.email}}</strong><small>{{invitation.role}} · expires {{invitation.expiresAt | date:'mediumDate'}}</small></span>
          <span class="bee-company-members__status" [class.is-suspended]="invitation.cancelledAt || invitation.acceptedAt">{{invitation.acceptedAt ? 'accepted' : invitation.cancelledAt ? 'cancelled' : 'pending'}}</span>
          <button *ngIf="!invitation.acceptedAt && !invitation.cancelledAt" type="button" class="bee-company-members__danger" (click)="cancelInvitation(invitation)" [disabled]="busyId === invitation.id">Cancel</button>
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
  inviteRole: "guest" | "member" | "manager" | "admin" = "member";
  acceptanceToken = "";
  inviteTokenInput = "";
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
      this.acceptanceToken = "";
      if (this.canRead && this.tenantId) void this.load();
    }
  }

  trackMember(_index: number, member: CompanyMember): string { return member.userId; }
  trackInvitation(_index: number, invitation: CompanyInvitation): string { return invitation.id; }
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
    if (!this.canRead || !this.tenantId || !this.token) return;
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
    this.acceptanceToken = "";
    try {
      const result = await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/invitations", "POST", { email: this.inviteEmail.trim(), role: this.inviteRole });
      this.acceptanceToken = result.acceptanceToken || "";
      this.inviteEmail = "";
      this.message = "Invitation created. Copy the one-time token and share it securely.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not create invitation";
    } finally {
      this.busyId = "";
    }
  }

  async acceptInvitation(event: Event): Promise<void> {
    event.preventDefault();
    const token = this.inviteTokenInput.trim();
    if (!token || this.busyId) return;
    this.busyId = "accept";
    this.error = "";
    this.message = "";
    try {
      const result = await this.request("/invitations/accept", "POST", { token });
      this.inviteTokenInput = "";
      this.message = "Invitation accepted for " + result.company.name + ". Select that company in the workspace switcher.";
      this.membershipChanged.emit();
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not accept invitation";
    } finally {
      this.busyId = "";
    }
  }

  async copyToken(): Promise<void> {
    if (!this.acceptanceToken) return;
    try { await navigator.clipboard.writeText(this.acceptanceToken); this.message = "Invitation token copied."; }
    catch { this.error = "Clipboard access is unavailable. Select and copy the token manually."; }
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

  async suspend(member: CompanyMember): Promise<void> {
    this.busyId = member.userId;
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships/" + encodeURIComponent(member.userId), "DELETE");
      this.message = "Membership suspended and active sessions revoked.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not suspend member";
    } finally { this.busyId = ""; }
  }

  async cancelInvitation(invitation: CompanyInvitation): Promise<void> {
    this.busyId = invitation.id;
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/invitations/" + encodeURIComponent(invitation.id), "DELETE");
      this.message = "Invitation cancelled.";
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not cancel invitation";
    } finally { this.busyId = ""; }
  }
}
