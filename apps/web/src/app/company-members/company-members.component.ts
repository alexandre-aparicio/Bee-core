import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BeeI18nService } from "../i18n/bee-i18n.service";

type CompanyMember = { userId: string; email: string | null; role: string; customRoleId?: string | null; restrictionRoleIds?: string[]; status: "active" | "suspended"; createdAt: string };
type CustomRole = { id: string; name: string; description: string; permissions: string[]; mode?: "grant" | "restriction" };
type CompanyInvitation = { id: string; email: string; role: string; customRoleId?: string | null; restrictionRoleIds?: string[]; createdAt: string; expiresAt: string; acceptedAt: string | null; cancelledAt: string | null; status?: "pending" | "accepted" | "cancelled" | "expired" };

@Component({
  selector: "bee-company-members",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="users" class="bee-users">
      <header class="bee-users__header">
        <div class="bee-users__heading">
          <span class="bee-users__eyebrow">{{t('users.eyebrow')}}</span>
          <h2>{{t('users.title')}}</h2>
          <p>{{t('users.description')}}</p>
        </div>
        <button class="bee-users__button bee-users__button--secondary" type="button" (click)="load()" [disabled]="loading || !canRead">
          <span aria-hidden="true">↻</span>{{loading ? t('users.refreshing') : t('users.refresh')}}
        </button>
      </header>

      <div *ngIf="error" class="bee-users__notice bee-users__notice--error" role="alert">{{error}}</div>
      <div *ngIf="message" class="bee-users__notice bee-users__notice--success" role="status">{{message}}</div>

      <ng-container *ngIf="canRead; else noAccess">
        <div class="bee-users__metrics" [attr.aria-label]="t('users.overview')">
          <article class="bee-users__metric">
            <span>{{t('users.totalMembers')}}</span><strong>{{members.length}}</strong><small>{{t('users.inOrganization')}}</small>
          </article>
          <article class="bee-users__metric">
            <span>{{t('users.activeMembers')}}</span><strong>{{activeMemberCount}}</strong><small>{{t('users.withAccess')}}</small>
          </article>
          <article class="bee-users__metric">
            <span>{{t('users.suspendedMembers')}}</span><strong>{{suspendedMemberCount}}</strong><small>{{t('users.accessPaused')}}</small>
          </article>
          <article class="bee-users__metric" *ngIf="canInvite">
            <span>{{t('users.pendingInvitations')}}</span><strong>{{pendingInvitationCount}}</strong><small>{{t('users.awaitingAcceptance')}}</small>
          </article>
        </div>

        <div class="bee-users__workspace">
          <section class="bee-users__directory">
            <div class="bee-users__section-head">
              <div><h3>{{t('users.directory')}}</h3><p>{{t('users.directoryDescription')}}</p></div>
              <span class="bee-users__count">{{filteredMembers.length}} / {{members.length}}</span>
            </div>
            <div class="bee-users__toolbar">
              <label class="bee-users__search">
                <span aria-hidden="true">⌕</span>
                <input type="search" [(ngModel)]="memberSearch" [placeholder]="t('users.search')" [attr.aria-label]="t('users.search')">
              </label>
              <select class="bee-users__filter" [(ngModel)]="memberStatusFilter" [attr.aria-label]="t('users.filterStatus')">
                <option value="all">{{t('users.allStatuses')}}</option>
                <option value="active">{{t('users.active')}}</option>
                <option value="suspended">{{t('users.suspended')}}</option>
              </select>
            </div>

            <div *ngIf="loading" class="bee-users__state" role="status"><span class="bee-users__spinner"></span>{{t('users.loadingMembers')}}</div>
            <div *ngIf="!loading && filteredMembers.length" class="bee-users__table-wrap">
              <table class="bee-users__table">
                <thead><tr><th scope="col">{{t('users.member')}}</th><th scope="col">{{t('users.role')}}</th><th scope="col">{{t('users.status')}}</th><th scope="col">{{t('users.joined')}}</th><th scope="col" *ngIf="canManage"><span class="bee-users__sr-only">{{t('users.actions')}}</span></th></tr></thead>
                <tbody>
                  <tr *ngFor="let member of filteredMembers; trackBy: trackMember">
                    <td>
                      <div class="bee-users__identity">
                        <span class="bee-users__avatar" aria-hidden="true">{{memberInitials(member.email)}}</span>
                        <span class="bee-users__identity-copy"><strong>{{member.email || t('users.unnamedMember')}}</strong><small>{{member.role === 'owner' ? t('users.organizationOwner') : t('users.organizationMember')}}</small></span>
                      </div>
                      <div *ngIf="canManageCustomRoles && member.role !== 'owner' && member.role !== 'super_admin' && restrictionRoles.length" class="bee-users__restrictions">
                        <span>{{t('users.restrictions')}}</span>
                        <label *ngFor="let restriction of restrictionRoles"><input type="checkbox" [checked]="(member.restrictionRoleIds || []).includes(restriction.id)" (change)="toggleRestriction(member,restriction.id,$any($event.target).checked)" [disabled]="busyId === member.userId"><span>{{restriction.name}}</span></label>
                      </div>
                    </td>
                    <td>
                      <select *ngIf="canManage && member.role !== 'owner' && member.role !== 'super_admin' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')" [value]="member.role === 'custom' ? 'custom:' + member.customRoleId : member.role" (change)="changeRole(member,$any($event.target).value)" [disabled]="busyId === member.userId" [attr.aria-label]="t('users.changeRoleFor') + ' ' + (member.email || t('users.unnamedMember'))">
                        <option value="guest">{{t('users.guest')}}</option><option value="member">{{t('users.memberRole')}}</option><option value="manager">{{t('users.manager')}}</option><option *ngIf="canAssignOwner" value="owner">{{t('users.owner')}}</option><option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">{{t('users.admin')}}</option><option *ngFor="let customRole of grantRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option>
                      </select>
                      <span *ngIf="!canManage || member.role === 'owner' || member.role === 'super_admin' || (member.role === 'admin' && role !== 'owner' && role !== 'super_admin')" class="bee-users__role-label">{{displayRole(member.role,member.customRoleId)}}</span>
                    </td>
                    <td><span class="bee-users__status" [class.is-active]="member.status === 'active'" [class.is-suspended]="member.status !== 'active'"><span></span>{{member.status === 'active' ? t('users.active') : t('users.suspended')}}</span></td>
                    <td class="bee-users__date">{{member.createdAt | date:'mediumDate'}}</td>
                    <td *ngIf="canManage" class="bee-users__actions-cell">
                      <div class="bee-users__menu-wrap" *ngIf="member.role !== 'owner' && member.role !== 'super_admin' && (role === 'owner' || role === 'super_admin' || member.role !== 'admin')">
                        <button type="button" class="bee-users__icon-button" [attr.aria-label]="t('users.memberOptions') + ' ' + (member.email || t('users.unnamedMember'))" [attr.aria-expanded]="openMemberMenuId === member.userId" (click)="toggleMemberMenu(member.userId)">⋮</button>
                        <div *ngIf="openMemberMenuId === member.userId" class="bee-users__menu">
                          <button type="button" *ngIf="member.status === 'active'" (click)="setMemberStatus(member,'suspended')" [disabled]="busyId === member.userId">{{t('users.suspendAccess')}}</button>
                          <button type="button" *ngIf="member.status === 'suspended'" (click)="setMemberStatus(member,'active')" [disabled]="busyId === member.userId">{{t('users.restoreAccess')}}</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div *ngIf="!loading && !filteredMembers.length" class="bee-users__empty">
              <span class="bee-users__empty-icon" aria-hidden="true">◎</span>
              <strong>{{members.length ? t('users.noMatches') : t('users.noMembers')}}</strong>
              <p>{{members.length ? t('users.adjustSearch') : t('users.noMembersDescription')}}</p>
              <button *ngIf="members.length" type="button" class="bee-users__text-button" (click)="memberSearch='';memberStatusFilter='all'">{{t('users.clearFilters')}}</button>
            </div>
          </section>

          <aside class="bee-users__invite-panel" *ngIf="canInvite">
            <div class="bee-users__invite-heading"><span class="bee-users__invite-icon" aria-hidden="true">＋</span><div><h3>{{t('users.inviteTitle')}}</h3><p>{{t('users.inviteDescription')}}</p></div></div>
            <form class="bee-users__invite-form" (submit)="invite($event)">
              <label>{{t('users.emailAddress')}}<input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" [placeholder]="t('users.emailPlaceholder')" autocomplete="email" required></label>
              <label>{{t('users.assignRole')}}<select name="inviteRole" [(ngModel)]="inviteRole"><option value="guest">{{t('users.guest')}}</option><option value="member">{{t('users.memberRole')}}</option><option value="manager">{{t('users.manager')}}</option><option *ngIf="role === 'owner' || role === 'super_admin'" value="admin">{{t('users.admin')}}</option><option *ngFor="let customRole of grantRoles" [value]="'custom:' + customRole.id">{{customRole.name}}</option></select></label>
              <fieldset *ngIf="canManageCustomRoles && restrictionRoles.length" class="bee-users__restriction-fieldset"><legend>{{t('users.additionalRestrictions')}}</legend><label *ngFor="let restriction of restrictionRoles"><input type="checkbox" [checked]="inviteRestrictionRoleIds.includes(restriction.id)" (change)="toggleInviteRestriction(restriction.id,$any($event.target).checked)"><span>{{restriction.name}}</span></label></fieldset>
              <button class="bee-users__button bee-users__button--primary" type="submit" [disabled]="busyId === 'invite' || !inviteEmail.trim()">{{busyId === 'invite' ? t('users.creating') : t('users.createInvitation')}}</button>
            </form>
            <div *ngIf="acceptanceLink" class="bee-users__share-link">
              <strong>{{t('users.invitationReady')}}</strong><p>{{t('users.invitationReadyDescription')}}</p>
              <div><input type="url" [value]="acceptanceLink" readonly [attr.aria-label]="t('users.invitationLink')"><button type="button" class="bee-users__button bee-users__button--secondary" (click)="copyLink()">{{t('users.copyLink')}}</button></div>
              <small>{{t('users.invitationExpiry')}}</small>
            </div>
          </aside>
        </div>

        <section class="bee-users__invitations" *ngIf="canInvite">
          <div class="bee-users__section-head"><div><h3>{{t('users.invitations')}}</h3><p>{{t('users.invitationsDescription')}}</p></div><span class="bee-users__count">{{invitations.length}}</span></div>
          <div *ngIf="invitations.length" class="bee-users__invitation-list">
            <article class="bee-users__invitation" *ngFor="let invitation of invitations; trackBy: trackInvitation">
              <span class="bee-users__invitation-icon" aria-hidden="true">✉</span>
              <div class="bee-users__invitation-copy"><strong>{{invitation.email}}</strong><small>{{displayRole(invitation.role,invitation.customRoleId)}} · {{t('users.expires')}} {{invitation.expiresAt | date:'mediumDate'}}</small></div>
              <span class="bee-users__status" [class.is-pending]="invitationState(invitation) === 'pending'" [class.is-suspended]="invitationState(invitation) !== 'pending'"><span></span>{{invitationState(invitation) === 'pending' ? t('users.pending') : invitationState(invitation) === 'accepted' ? t('users.accepted') : invitationState(invitation) === 'expired' ? t('users.expired') : t('users.revoked')}}</span>
              <div class="bee-users__menu-wrap">
                <button type="button" class="bee-users__icon-button" [attr.aria-label]="t('users.invitationOptions') + ' ' + invitation.email" [attr.aria-expanded]="openInvitationMenuId === invitation.id" (click)="toggleInvitationMenu(invitation.id)">⋮</button>
                <div *ngIf="openInvitationMenuId === invitation.id" class="bee-users__menu"><button type="button" class="is-danger" (click)="cancelInvitation(invitation)" [disabled]="busyId === invitation.id || invitation.acceptedAt || invitation.cancelledAt || invitation.status === 'expired'">{{t('users.revokeInvitation')}}</button></div>
              </div>
            </article>
          </div>
          <div *ngIf="!invitations.length" class="bee-users__empty bee-users__empty--compact"><strong>{{t('users.noInvitations')}}</strong><p>{{t('users.noInvitationsDescription')}}</p></div>
        </section>
      </ng-container>
      <ng-template #noAccess><div class="bee-users__empty"><strong>{{t('users.noAccessTitle')}}</strong><p>{{t('users.noAccessDescription')}}</p></div></ng-template>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;width:100%;color:inherit}
    .bee-users{display:grid;gap:20px;min-width:0;color:inherit}
    .bee-users__header,.bee-users__section-head,.bee-users__invite-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .bee-users__header{align-items:center}
    .bee-users__eyebrow{display:block;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .bee-users h2{margin:6px 0 5px;font-size:clamp(22px,2.2vw,28px);font-weight:700;letter-spacing:-.025em}
    .bee-users h3{margin:0;font-size:15px;font-weight:650}
    .bee-users p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}
    .bee-users__heading p{max-width:660px}
    .bee-users__button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 14px;border:1px solid var(--border);border-radius:9px;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease}
    .bee-users__button:focus-visible,.bee-users__icon-button:focus-visible,.bee-users__text-button:focus-visible,.bee-users__menu button:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
    .bee-users__button:disabled{opacity:.5;cursor:not-allowed}
    .bee-users__button--secondary{background:var(--panel);color:inherit}
    .bee-users__button--secondary:hover:not(:disabled){border-color:var(--purple);background:var(--bg)}
    .bee-users__button--primary{background:var(--purple);border-color:var(--purple);color:var(--bee-action-text);width:100%}
    .bee-users__button--primary:hover:not(:disabled){filter:brightness(1.08)}
    .bee-users__notice{padding:11px 14px;border:1px solid var(--border);border-radius:10px;font-size:12px;line-height:1.5}
    .bee-users__notice--error{border-color:var(--bee-status-danger);color:var(--bee-status-danger)}
    .bee-users__notice--success{border-color:var(--bee-status-success);color:var(--bee-status-success)}
    .bee-users__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .bee-users__metric{display:grid;gap:5px;padding:15px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel);min-width:0}
    .bee-users__metric>span{font-size:11px;color:var(--muted);font-weight:600}
    .bee-users__metric strong{font-size:25px;line-height:1.15;font-weight:700;font-variant-numeric:tabular-nums}
    .bee-users__metric small{font-size:10px;color:var(--muted)}
    .bee-users__workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,310px);gap:14px;align-items:start}
    .bee-users__directory,.bee-users__invite-panel,.bee-users__invitations{min-width:0;border:1px solid var(--border);border-radius:13px;background:var(--panel)}
    .bee-users__directory,.bee-users__invitations{padding:17px}
    .bee-users__section-head{align-items:center;margin-bottom:14px}
    .bee-users__section-head p{margin-top:4px}
    .bee-users__count{flex:none;padding:5px 9px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}
    .bee-users__toolbar{display:flex;gap:9px;margin-bottom:12px}
    .bee-users__search{display:flex;align-items:center;gap:8px;flex:1;min-width:120px;padding:0 11px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--muted)}
    .bee-users__search>span{font-size:19px;line-height:1}
    .bee-users__search input{width:100%;min-width:0;height:38px;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:12px}
    .bee-users__search:focus-within{border-color:var(--purple);box-shadow:0 0 0 2px color-mix(in srgb,var(--purple) 22%,transparent)}
    .bee-users__filter,.bee-users__table select,.bee-users__invite-form input,.bee-users__invite-form select,.bee-users__share-link input{min-width:0;min-height:40px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:inherit;font:inherit;font-size:11px}
    .bee-users__filter:focus-visible,.bee-users__table select:focus-visible,.bee-users__invite-form input:focus-visible,.bee-users__invite-form select:focus-visible,.bee-users__share-link input:focus-visible{outline:2px solid var(--purple);outline-offset:1px}
    .bee-users__table-wrap{max-width:100%;overflow-x:auto}
    .bee-users__table{width:100%;border-collapse:collapse;text-align:left;font-size:12px}
    .bee-users__table th{padding:10px 11px;border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;font-weight:650;white-space:nowrap}
    .bee-users__table td{padding:12px 11px;border-bottom:1px solid var(--border);vertical-align:middle}
    .bee-users__table tbody tr:last-child td{border-bottom:0}
    .bee-users__table tbody tr:hover{background:color-mix(in srgb,var(--muted) 6%,transparent)}
    .bee-users__identity{display:flex;align-items:center;gap:10px;min-width:190px}
    .bee-users__avatar{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--purple);font-size:11px;font-weight:750}
    .bee-users__identity-copy{display:grid;gap:3px;min-width:0}
    .bee-users__identity-copy strong{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:650}
    .bee-users__identity-copy small,.bee-users__date{color:var(--muted);font-size:10px;white-space:nowrap}
    .bee-users__table select{width:100%;max-width:170px;min-height:34px;padding:6px 8px}
    .bee-users__role-label{font-size:11px;font-weight:600}
    .bee-users__status{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:10px;font-weight:600;white-space:nowrap}
    .bee-users__status>span{width:6px;height:6px;border-radius:50%;background:var(--muted)}
    .bee-users__status.is-active>span,.bee-users__status.is-pending>span{background:var(--bee-status-success)}
    .bee-users__status.is-suspended>span{background:var(--bee-status-warning)}
    .bee-users__status.is-active{color:var(--bee-status-success)}
    .bee-users__status.is-suspended{color:var(--bee-status-warning)}
    .bee-users__status.is-pending{color:var(--bee-status-info)}
    .bee-users__actions-cell{text-align:right;width:42px}
    .bee-users__menu-wrap{position:relative;display:inline-flex}
    .bee-users__icon-button{display:grid;place-items:center;width:34px;height:34px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer}
    .bee-users__icon-button:hover,.bee-users__icon-button[aria-expanded=true]{border-color:var(--border);background:var(--bg)}
    .bee-users__menu{position:absolute;z-index:20;top:calc(100% + 5px);right:0;display:grid;min-width:170px;padding:5px;border:1px solid var(--border);border-radius:10px;background:var(--panel);box-shadow:var(--bee-shadow)}
    .bee-users__menu button{padding:9px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;font:inherit;font-size:11px;cursor:pointer}
    .bee-users__menu button:hover:not(:disabled){background:var(--bg)}
    .bee-users__menu button:disabled{opacity:.5;cursor:not-allowed}
    .bee-users__menu button.is-danger{color:var(--bee-status-danger)}
    .bee-users__restrictions{display:flex;flex-wrap:wrap;align-items:center;gap:5px 9px;margin:8px 0 0 44px}
    .bee-users__restrictions>span{width:100%;color:var(--muted);font-size:9px}
    .bee-users__restrictions label,.bee-users__restriction-fieldset label{display:inline-flex;align-items:center;gap:5px;color:var(--muted);font-size:10px}
    .bee-users__restrictions input,.bee-users__restriction-fieldset input{accent-color:var(--purple)}
    .bee-users__invite-panel{padding:17px}
    .bee-users__invite-heading{justify-content:flex-start;align-items:center;margin-bottom:16px}
    .bee-users__invite-icon,.bee-users__invitation-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--purple);font-size:18px}
    .bee-users__invite-heading p{margin-top:4px;font-size:11px}
    .bee-users__invite-form{display:grid;gap:12px}
    .bee-users__invite-form>label{display:grid;gap:6px;color:var(--muted);font-size:10px;font-weight:650}
    .bee-users__invite-form input,.bee-users__invite-form select{width:100%;box-sizing:border-box;color:inherit}
    .bee-users__restriction-fieldset{display:grid;gap:8px;margin:0;padding:10px;border:1px solid var(--border);border-radius:9px}
    .bee-users__restriction-fieldset legend{padding:0 5px;color:var(--muted);font-size:10px;font-weight:650}
    .bee-users__share-link{display:grid;gap:8px;margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}
    .bee-users__share-link strong{font-size:11px}
    .bee-users__share-link p,.bee-users__share-link small{color:var(--muted);font-size:10px}
    .bee-users__share-link>div{display:flex;gap:6px;min-width:0}
    .bee-users__share-link input{flex:1;width:100%;min-width:0}
    .bee-users__share-link .bee-users__button{flex:none;min-height:36px;padding:7px 9px;font-size:10px}
    .bee-users__invitations{padding:17px}
    .bee-users__invitation-list{display:grid}
    .bee-users__invitation{display:flex;align-items:center;gap:12px;min-width:0;padding:11px 0;border-top:1px solid var(--border)}
    .bee-users__invitation-copy{display:grid;gap:4px;flex:1;min-width:0}
    .bee-users__invitation-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
    .bee-users__invitation-copy small{color:var(--muted);font-size:10px}
    .bee-users__empty,.bee-users__state{display:grid;justify-items:center;gap:7px;padding:28px 16px;border:1px dashed var(--border);border-radius:10px;text-align:center}
    .bee-users__empty strong{font-size:12px}.bee-users__empty p{max-width:360px}
    .bee-users__empty--compact{padding:18px}
    .bee-users__empty-icon{color:var(--muted);font-size:25px}
    .bee-users__text-button{border:0;background:transparent;color:var(--purple);font:inherit;font-size:11px;font-weight:650;cursor:pointer}
    .bee-users__state{display:flex;justify-content:center;color:var(--muted);font-size:11px}
    .bee-users__spinner{width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--purple);border-radius:50%;animation:bee-users-spin .7s linear infinite}
    .bee-users__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @keyframes bee-users-spin{to{transform:rotate(360deg)}}
    @media(max-width:1100px){.bee-users__workspace{grid-template-columns:minmax(0,1fr) 270px}.bee-users__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:820px){.bee-users__workspace{grid-template-columns:1fr}.bee-users__invite-panel{order:-1}.bee-users__invite-form{grid-template-columns:repeat(2,minmax(0,1fr))}.bee-users__invite-form>label{min-width:0}.bee-users__invite-form .bee-users__button{align-self:end}}
    @media(max-width:620px){.bee-users{gap:14px}.bee-users__header,.bee-users__section-head{align-items:flex-start}.bee-users__header{flex-direction:column}.bee-users__metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.bee-users__metric{padding:12px}.bee-users__metric strong{font-size:22px}.bee-users__directory,.bee-users__invitations,.bee-users__invite-panel{padding:13px}.bee-users__toolbar{flex-direction:column}.bee-users__filter{width:100%}.bee-users__invite-form{grid-template-columns:1fr}.bee-users__invite-form .bee-users__button{align-self:stretch}.bee-users__invitation{gap:8px;flex-wrap:wrap}.bee-users__invitation-copy{flex-basis:calc(100% - 58px)}.bee-users__invitation .bee-users__status{margin-left:46px}.bee-users__table{min-width:650px}}
    @media(prefers-reduced-motion:reduce){.bee-users__button,.bee-users__spinner{transition:none;animation:none}}
  `]

})
export class CompanyMembersComponent implements OnInit, OnChanges {
  constructor(private readonly i18n: BeeI18nService) {}
  t(key: string): string { return this.i18n.t("organization:" + key); }
  memberSearch = "";
  memberStatusFilter: "all" | "active" | "suspended" = "all";
  get filteredMembers(): CompanyMember[] {
    const query = this.memberSearch.trim().toLowerCase();
    return this.members.filter(member => (this.memberStatusFilter === "all" || member.status === this.memberStatusFilter)
      && (!query || String(member.email || "").toLowerCase().includes(query) || this.displayRole(member.role, member.customRoleId).toLowerCase().includes(query)));
  }
  get activeMemberCount(): number { return this.members.filter(member => member.status === "active").length; }
  get suspendedMemberCount(): number { return this.members.filter(member => member.status === "suspended").length; }
  get pendingInvitationCount(): number { return this.invitations.filter(invitation => this.invitationState(invitation) === "pending").length; }
  memberInitials(email: string | null): string { const value = String(email || "?").trim(); return value.slice(0, 1).toUpperCase(); }
  displayRole(role: string, customRoleId?: string | null): string {
    if (role === "custom") return this.customRoleName(customRoleId);
    const key: Record<string, string> = { owner: "users.owner", super_admin: "users.superAdmin", admin: "users.admin", manager: "users.manager", member: "users.memberRole", guest: "users.guest" };
    return key[role] ? this.t(key[role]) : role;
  }

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
