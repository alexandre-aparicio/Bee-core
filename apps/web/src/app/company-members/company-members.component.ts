import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type CompanyMember = { userId: string; email: string | null; role: string; customRoleId?: string | null; status: "active" | "suspended"; createdAt: string };
type CustomRole = { id: string; name: string; description: string; permissions: string[] };
type CompanyInvitation = { id: string; email: string; role: string; createdAt: string; expiresAt: string; acceptedAt: string | null; cancelledAt: string | null };

@Component({
  selector: "bee-company-members",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="users" class="panel bee-dashboard-card bee-company-members">
      <div class="panel-heading">
        <div><h2>{{canRead ? "Company members" : "Join a company"}}</h2><p>{{canRead ? "Memberships and roles apply only to the active company." : "Have an invitation token? Accept it to join another company."}}</p></div>
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
                <select *ngIf="canManage && member.role !== 'owner' && (role === 'owner' || member.role !== 'admin')" [value]="member.role === 'custom' ? 'custom:' + member.customRoleId : member.role" (change)="changeRole(member, $any($event.target).value)" [disabled]="busyId === member.userId">
                  <option value="guest">Guest</option><option value="member">Member</option><option value="manager">Manager</option>
                  <option *ngIf="role === 'owner'" value="admin">Admin</option>
                  <option *ngFor="let customRole of customRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option>
                </select>
                <span *ngIf="!canManage || member.role === 'owner'">{{member.role === 'custom' ? customRoleName(member.customRoleId) : member.role}}</span>
              </td>
              <td><span class="bee-company-members__status" [class.is-suspended]="member.status !== 'active'">{{member.status}}</span></td>
              <td *ngIf="canManage"><button *ngIf="member.role !== 'owner' && member.status === 'active' && (role === 'owner' || member.role !== 'admin')" class="bee-company-members__danger" type="button" (click)="suspend(member)" [disabled]="busyId === member.userId">Suspend</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="canRead && !loading && !members.length" class="bee-company-members__state">No members found.</div>

      <div *ngIf="canManageCustomRoles" class="bee-company-members__roles">
        <div class="bee-company-members__roles-head"><div><h3>Custom roles</h3><p>Create company-specific access profiles using the permissions below.</p></div></div>
        <form class="bee-company-members__role-form" (submit)="saveCustomRole($event)">
          <input type="text" name="customRoleName" [(ngModel)]="customRoleNameInput" placeholder="Role name" maxlength="48" required>
          <input type="text" name="customRoleDescription" [(ngModel)]="customRoleDescriptionInput" placeholder="Description (optional)" maxlength="240">
          <div class="bee-company-members__permission-grid">
            <label *ngFor="let permission of customRolePermissionOptions"><input type="checkbox" [checked]="permission.selected" (change)="permission.selected = $any($event.target).checked"><span>{{permission.label}}<small>{{permission.key}}</small></span></label>
          </div>
          <div class="bee-company-members__role-actions"><button type="submit" [disabled]="busyId === 'custom-role' || !customRoleNameInput.trim()">{{busyId === 'custom-role' ? 'Saving…' : customRoleEditingId ? 'Update role' : 'Create role'}}</button><button *ngIf="customRoleEditingId" type="button" class="bee-company-members__role-cancel" (click)="resetCustomRoleForm()">Cancel edit</button></div>
        </form>
        <div class="bee-company-members__role-list" *ngIf="customRoles.length">
          <div class="bee-company-members__role-item" *ngFor="let customRole of customRoles; trackBy: trackCustomRole"><span><strong>{{customRole.name}}</strong><small>{{customRole.description || "No description"}} · {{customRole.permissions.length}} permissions</small></span><div><button type="button" (click)="editCustomRole(customRole)">Edit</button><button type="button" class="bee-company-members__danger" (click)="deleteCustomRole(customRole)" [disabled]="busyId === customRole.id">Delete</button></div></div>
        </div>
      </div>

      <div *ngIf="canInvite" class="bee-company-members__invite">
        <h3>Invite a colleague</h3>
        <form (submit)="invite($event)">
          <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" placeholder="colleague@company.com" required>
          <select name="inviteRole" [(ngModel)]="inviteRole"><option value="member">Member</option><option value="manager">Manager</option><option *ngIf="role === 'owner'" value="admin">Admin</option></select>
          <button type="submit" [disabled]="busyId === 'invite' || !inviteEmail.trim()">{{busyId === 'invite' ? 'Creating…' : 'Create invitation'}}</button>
        </form>
        <div *ngIf="acceptanceToken" class="bee-company-members__token">
          <strong>One-time invitation token</strong>
          <code>{{acceptanceToken}}</code>
          <button type="button" (click)="copyToken()">Copy token</button>
          <small>Share this token securely with the invited user. It expires in seven days and is shown only once.</small>
        </div>
      </div>

      <div *ngIf="canManage && invitations.length" class="bee-company-members__invitations">
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
  customRoleNameInput = "";
  customRoleDescriptionInput = "";
  customRoleEditingId = "";
  customRolePermissionOptions = [
    {key:"members.read",label:"Read members",selected:true},
    {key:"plugins.read",label:"View plugins",selected:true},
    {key:"plugins.install",label:"Install plugins",selected:false},
    {key:"files.read",label:"Read files",selected:false},
    {key:"files.write",label:"Manage files",selected:false},
    {key:"notes.read",label:"Read notes",selected:false},
    {key:"notes.write",label:"Manage notes",selected:false}
  ];
  inviteEmail = "";
  inviteRole: "guest" | "member" | "manager" | "admin" = "member";
  acceptanceToken = "";
  inviteTokenInput = "";
  loading = false;
  private requestSequence = 0;
  busyId = "";
  error = "";
  message = "";

  get canRead(): boolean { return this.role === "owner" || this.role === "admin" || this.role === "manager"; }
  get canManage(): boolean { return this.role === "owner" || this.role === "admin"; }
  get canInvite(): boolean { return this.canManage; }
  get canManageCustomRoles(): boolean { return this.role === "owner"; }

  ngOnInit(): void { void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes["tenantId"] || changes["role"]) && !changes["tenantId"]?.firstChange) {
      this.requestSequence++;
      this.members = [];
      this.invitations = [];
      this.customRoles = [];
      this.loading = false;
      this.error = "";
      this.message = "";
      this.acceptanceToken = "";
      this.resetCustomRoleForm();
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
      const result = await this.request("/companies/" + encodeURIComponent(requestedTenantId) + "/memberships");
      if (!isCurrentRequest()) return;
      this.members = result.memberships || [];
      if (this.canManage) {
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
        this.resetCustomRoleForm();
      }
    } catch (error) {
      if (isCurrentRequest()) this.error = error instanceof Error ? error.message : "Could not load company members";
    } finally {
      if (isCurrentRequest()) this.loading = false;
    }
  }

  resetCustomRoleForm():void {
    this.customRoleEditingId="";this.customRoleNameInput="";this.customRoleDescriptionInput="";
    for(const permission of this.customRolePermissionOptions)permission.selected=["members.read","plugins.read"].includes(permission.key);
  }

  editCustomRole(role:CustomRole):void {
    this.customRoleEditingId=role.id;this.customRoleNameInput=role.name;this.customRoleDescriptionInput=role.description||"";
    for(const permission of this.customRolePermissionOptions)permission.selected=role.permissions.includes(permission.key);
  }

  async saveCustomRole(event:Event):Promise<void> {
    event.preventDefault();
    if(!this.canManageCustomRoles||!this.customRoleNameInput.trim()||this.busyId)return;
    this.busyId="custom-role";this.error="";this.message="";
    const body={name:this.customRoleNameInput.trim(),description:this.customRoleDescriptionInput.trim(),permissions:this.customRolePermissionOptions.filter(item=>item.selected).map(item=>item.key)};
    try {
      if(this.customRoleEditingId)await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(this.customRoleEditingId),"PUT",body);
      else await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles","POST",body);
      this.message=this.customRoleEditingId?"Custom role updated.":"Custom role created.";this.resetCustomRoleForm();await this.load();
    } catch(error) { this.error=error instanceof Error?error.message:"Could not save custom role"; }
    finally { this.busyId=""; }
  }

  async deleteCustomRole(role:CustomRole):Promise<void> {
    if(!this.canManageCustomRoles||this.busyId)return;
    this.busyId=role.id;this.error="";this.message="";
    try { await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/roles/"+encodeURIComponent(role.id),"DELETE");this.message="Custom role deleted.";await this.load(); }
    catch(error) { this.error=error instanceof Error?error.message:"Could not delete custom role"; }
    finally { this.busyId=""; }
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
    if (customRoleId ? (!this.canManageCustomRoles || !this.customRoles.some(item => item.id === customRoleId)) : !["admin", "manager", "member", "guest"].includes(role)) return;
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
