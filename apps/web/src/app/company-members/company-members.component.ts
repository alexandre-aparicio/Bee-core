import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type CompanyMember = { userId: string; email: string | null; role: "owner" | "admin" | "manager" | "member"; status: "active" | "suspended"; createdAt: string };
type CompanyInvitation = { id: string; email: string; role: string; createdAt: string; expiresAt: string; acceptedAt: string | null; cancelledAt: string | null };

@Component({
  selector: "bee-company-members",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="users" class="panel bee-company-members">
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
                <select *ngIf="canManage && member.role !== 'owner' && (role === 'owner' || member.role !== 'admin')" [value]="member.role" (change)="changeRole(member, $any($event.target).value)" [disabled]="busyId === member.userId">
                  <option value="member">Member</option><option value="manager">Manager</option>
                  <option *ngIf="role === 'owner'" value="admin">Admin</option>
                </select>
                <span *ngIf="!canManage || member.role === 'owner'">{{member.role}}</span>
              </td>
              <td><span class="bee-company-members__status" [class.is-suspended]="member.status !== 'active'">{{member.status}}</span></td>
              <td *ngIf="canManage"><button *ngIf="member.role !== 'owner' && member.status === 'active' && (role === 'owner' || member.role !== 'admin')" class="bee-company-members__danger" type="button" (click)="suspend(member)" [disabled]="busyId === member.userId">Suspend</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="canRead && !loading && !members.length" class="bee-company-members__state">No members found.</div>

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
  @Output() membershipChanged = new EventEmitter<void>();
  members: CompanyMember[] = [];
  invitations: CompanyInvitation[] = [];
  inviteEmail = "";
  inviteRole: "member" | "manager" | "admin" = "member";
  acceptanceToken = "";
  inviteTokenInput = "";
  loading = false;
  busyId = "";
  error = "";
  message = "";

  get canRead(): boolean { return this.role === "owner" || this.role === "admin" || this.role === "manager"; }
  get canManage(): boolean { return this.role === "owner" || this.role === "admin"; }
  get canInvite(): boolean { return this.canManage; }

  ngOnInit(): void { void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes["tenantId"] || changes["role"]) && !changes["tenantId"]?.firstChange) void this.load();
  }

  trackMember(_index: number, member: CompanyMember): string { return member.userId; }
  trackInvitation(_index: number, invitation: CompanyInvitation): string { return invitation.id; }

  private get token(): string {
    try { return JSON.parse(localStorage.getItem("bee-auth") || "null")?.accessToken || ""; }
    catch { return ""; }
  }

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
    this.loading = true;
    this.error = "";
    try {
      const result = await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships");
      this.members = result.memberships || [];
      if (this.canManage) {
        const pending = await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/invitations");
        this.invitations = pending.invitations || [];
      } else {
        this.invitations = [];
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load company members";
    } finally {
      this.loading = false;
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
    if (!["admin", "manager", "member"].includes(role)) return;
    this.busyId = member.userId;
    this.error = "";
    try {
      await this.request("/companies/" + encodeURIComponent(this.tenantId) + "/memberships/" + encodeURIComponent(member.userId), "PUT", { role });
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
