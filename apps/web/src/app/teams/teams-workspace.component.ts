
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy } from "@angular/core";
import { FormsModule } from "@angular/forms";

type Team = { id:string; name:string; description:string; status:"active"|"archived"; memberCount:number; applications:string[]; parentTeamId?:string|null };
type Member = { userId:string; email:string };
type TeamView = "cards" | "table";

@Component({
 selector:"bee-teams-workspace",
 standalone:true,
 imports: [FormsModule],
 template:`
<section class="teams-workspace">
  @if (error) {
    <p class="teams-workspace__feedback teams-workspace__feedback--error" role="alert">{{error}}</p>
  }


  @if (composerOpen && canManage) {
    <div class="teams-workspace__overlay" (click)="closeComposer()">
      <section class="teams-workspace__composer" role="dialog" aria-modal="true" aria-labelledby="teams-modal-title" aria-label="Team editor" (click)="$event.stopPropagation()" (keydown.escape)="closeComposer()" tabindex="-1">
        <div class="teams-workspace__composer-heading"><div><span class="teams-workspace__eyebrow">{{composerMode === 'manage' ? 'TEAM MEMBERS & APPLICATIONS' : composerMode === 'edit' ? 'TEAM SETTINGS' : 'NEW TEAM'}}</span><h3 id="teams-modal-title">{{composerMode === 'manage' ? 'Manage team' : composerMode === 'edit' ? 'Edit team' : 'Create a team'}}</h3></div><button type="button" class="teams-workspace__icon-button" (click)="closeComposer()" aria-label="Close editor">×</button></div>
        @if (composerMode !== 'manage') {
          <form (submit)="save($event)">
            <div class="teams-workspace__form-row">
              <label class="teams-workspace__field teams-workspace__field--name"><span>Team name</span><input name="name" [(ngModel)]="name" maxlength="64" placeholder="e.g. Product & Design" required autocomplete="off"></label>
              <label class="teams-workspace__field teams-workspace__field--description"><span>Description <small>Optional</small></span><input name="description" [(ngModel)]="description" maxlength="240" placeholder="What does this team work on?"></label>
              <label class="teams-workspace__field teams-workspace__field--parent"><span>Parent team <small>Optional</small></span><select name="parent" [(ngModel)]="parentTeamId"><option value="">No parent</option>@for (item of teams; track item) {
              <option [value]="item.id" [disabled]="item.id===selected?.id">{{item.name}}</option>
            }</select></label>
            <button type="submit" class="teams-workspace__button teams-workspace__button--primary teams-workspace__save" [disabled]="busy || !name.trim()">{{busy ? 'Saving…' : selected ? 'Save changes' : 'Create team'}}</button>
          </div>
        </form>
      }
      @if (selected) {
        <div class="teams-workspace__advanced">
          <details class="teams-workspace__editor-details" open><summary>Members <span class="teams-workspace__detail-count">{{selectedMemberIds.length}}</span></summary><div class="teams-workspace__member-picker">@for (member of allMembers; track member) {
          <label class="teams-workspace__check"><input type="checkbox" [checked]="selectedMemberIds.includes(member.userId)" (change)="toggleMember(member.userId,$any($event.target).checked)"><span>{{member.email}}</span></label>
          }@if (!allMembers.length) {
          <p class="teams-workspace__muted">No active organization members available.</p>
          }<button type="button" class="teams-workspace__button" (click)="saveMembers()" [disabled]="busy">Save members</button></div></details>
          <details class="teams-workspace__editor-details" open><summary>Applications <span class="teams-workspace__detail-count">{{selectedApplications.length}}</span></summary><div class="teams-workspace__application-editor"><p class="teams-workspace__muted">Assign the applications where this team should be available. Resource permissions are configured separately.</p><div class="teams-workspace__autocomplete"><input [(ngModel)]="pluginInput" name="pluginInput" placeholder="Type an app name, e.g. doc…" list="teams-app-suggestions" autocomplete="off" (keydown.enter)="$event.preventDefault();addPlugin()"><datalist id="teams-app-suggestions">@for (app of applicationCatalog; track app) {
          <option [value]="app.id">{{app.label}}</option>
          }</datalist><button type="button" class="teams-workspace__button" (click)="addPlugin()" [disabled]="!pluginInput.trim()">Add app</button></div><div class="teams-workspace__chips">@for (app of selectedApplications; track app) {
          <span class="teams-workspace__chip">{{applicationLabel(app)}}<button type="button" (click)="removePlugin(app)" [attr.aria-label]="'Remove '+app">×</button></span>
        }</div>@if (matchingApplications.length) {
        <div class="teams-workspace__suggestions"><span>Suggestions</span>@for (app of matchingApplications; track app) {
        <button type="button" (click)="chooseApplication(app.id)">{{app.label}} <small>{{app.id}}</small></button>
      }</div>
      }<button type="button" class="teams-workspace__button" (click)="saveApplications()" [disabled]="busy">Save applications</button></div></details>
    </div>
  }
</section>
</div>
}

<section class="teams-workspace__directory">
  <div class="teams-workspace__toolbar">
    <div class="teams-workspace__toolbar-filters">
      <div class="teams-workspace__search"><span aria-hidden="true">⌕</span><input [(ngModel)]="search" name="teamSearch" placeholder="Search teams…" aria-label="Search teams">@if (search) {
      <button type="button" (click)="search=''" aria-label="Clear search">×</button>
    }</div>
    <select class="teams-workspace__status-filter" [(ngModel)]="statusFilter" name="teamStatus" aria-label="Filter teams by status"><option value="all">All teams</option><option value="active">Active</option><option value="archived">Archived</option></select>
  </div>
  <div class="teams-workspace__toolbar-actions">
    <div class="teams-workspace__view-toggle" role="group" aria-label="Team display mode">
      <button type="button" [class.is-active]="view==='cards'" [attr.aria-pressed]="view==='cards'" (click)="view='cards'" aria-label="Card view" title="Card view"><span aria-hidden="true">▦</span></button>
      <button type="button" [class.is-active]="view==='table'" [attr.aria-pressed]="view==='table'" (click)="view='table'" aria-label="Table view" title="Table view"><span aria-hidden="true">☷</span></button>
    </div>
    @if (canManage) {
      <button type="button" class="teams-workspace__toolbar-create" (click)="startCreate()">＋ New team</button>
    }
  </div>
</div>

<div class="teams-workspace__section-heading"><div><h3>Organization teams</h3><span>{{filteredTeams.length}} {{filteredTeams.length===1?'team':'teams'}} shown</span></div><button type="button" class="teams-workspace__text-button" (click)="load()" [disabled]="loading">Refresh list</button></div>

@if (loading && !teams.length) {
  <div class="teams-workspace__empty"><span class="teams-workspace__loader"></span><strong>Loading teams…</strong></div>
}
@if (!loading && !teams.length) {
  <div class="teams-workspace__empty"><span class="teams-workspace__empty-icon">◇</span><strong>No teams yet</strong><span>Create your first team to organize people and application access.</span>@if (canManage) {
  <button type="button" class="teams-workspace__button teams-workspace__button--primary" (click)="startCreate()">Create first team</button>
}</div>
}
@if (teams.length && !filteredTeams.length) {
  <div class="teams-workspace__empty"><strong>No matching teams</strong><span>Try another search or status filter.</span><button type="button" class="teams-workspace__text-button" (click)="search='';statusFilter='all'">Clear filters</button></div>
}

@if (filteredTeams.length && view==='cards') {
  <div class="teams-workspace__cards">
    @for (team of filteredTeams; track team) {
      <article class="teams-workspace__card" [class.is-selected]="selected?.id===team.id">
        <div class="teams-workspace__card-top"><span class="teams-workspace__team-mark">{{team.name.slice(0,1).toUpperCase()}}</span>@if (canManage) {
        <div class="teams-workspace__card-menu"><details><summary aria-label="Team options" title="Team options"><span>⋮</span></summary><div class="teams-workspace__menu" role="menu"><button type="button" role="menuitem" (click)="editTeam(team)">Edit team</button><button type="button" role="menuitem" (click)="manageTeam(team)">Manage members & apps</button>@if (canManage && team.status==='active') {
        <button type="button" role="menuitem" (click)="archiveTeam(team)">Archive</button>
        }@if (canManage && team.status==='archived') {
        <button type="button" role="menuitem" (click)="restoreTeam(team)">Restore</button>
        }@if (canManage) {
        <button type="button" role="menuitem" class="is-danger" (click)="deleteTeam(team)">Delete</button>
      }</div></details></div>
    }</div>
    <button type="button" class="teams-workspace__card-main" (click)="manageTeam(team)"><strong>{{team.name}}</strong><span class="teams-workspace__card-description">{{team.description || 'No description added'}}</span></button>
    <div class="teams-workspace__card-meta"><div><strong>{{team.memberCount}}</strong><small>{{team.memberCount===1?'member':'members'}}</small></div><span class="teams-workspace__status" [class.is-archived]="team.status==='archived'">{{team.status}}</span></div>
    <div class="teams-workspace__card-footer"><div class="teams-workspace__app-tags">@for (app of team.applications.slice(0,3); track app) {
      <span>{{applicationLabel(app)}}</span>
      }@if (team.applications.length>3) {
      <span>+{{team.applications.length-3}}</span>
      }@if (!team.applications.length) {
      <span class="is-empty">No apps assigned</span>
    }</div>@if (team.parentTeamId) {
    <span class="teams-workspace__parent">Sub-team</span>
  }</div>
</article>
}
</div>
}

@if (filteredTeams.length && view==='table') {
  <div class="teams-workspace__table-wrap">
    <table><thead><tr><th>Team</th><th>Members</th><th>Applications</th><th>Status</th><th><span class="teams-workspace__sr-only">Options</span></th></tr></thead><tbody>
    @for (team of filteredTeams; track team) {
      <tr><td><button type="button" class="teams-workspace__table-team" (click)="manageTeam(team)"><span class="teams-workspace__team-mark">{{team.name.slice(0,1).toUpperCase()}}</span><span><strong>{{team.name}}</strong><small>{{team.description || 'No description'}}</small></span></button></td><td><span class="teams-workspace__table-count"><span>{{team.memberCount}}</span> {{team.memberCount===1?'member':'members'}}</span></td><td><div class="teams-workspace__app-tags">@for (app of team.applications.slice(0,3); track app) {
      <span>{{applicationLabel(app)}}</span>
      }@if (team.applications.length>3) {
      <span>+{{team.applications.length-3}}</span>
      }@if (!team.applications.length) {
      <span class="is-empty">—</span>
      }</div></td><td><span class="teams-workspace__status" [class.is-archived]="team.status==='archived'">{{team.status}}</span></td><td>@if (canManage) {
      <details class="teams-workspace__table-menu"><summary aria-label="Team options">⋮</summary><div class="teams-workspace__menu" role="menu"><button type="button" role="menuitem" (click)="editTeam(team)">Edit team</button><button type="button" role="menuitem" (click)="manageTeam(team)">Manage members & apps</button>@if (canManage && team.status==='active') {
      <button type="button" role="menuitem" (click)="archiveTeam(team)">Archive</button>
      }@if (canManage && team.status==='archived') {
      <button type="button" role="menuitem" (click)="restoreTeam(team)">Restore</button>
      }@if (canManage) {
      <button type="button" role="menuitem" class="is-danger" (click)="deleteTeam(team)">Delete</button>
    }</div></details>
  }</td></tr>
}
</tbody></table>
</div>
}
</section>

@if (canManage) {
  <details class="teams-workspace__acl">
    <summary><span><strong>Resource access policies</strong><small>Grant teams access to individual resources, with user-level exceptions.</small></span><span class="teams-workspace__acl-arrow">⌄</span></summary>
    <div class="teams-workspace__acl-content"><p class="teams-workspace__muted">A user's explicit denial overrides grants from every team they belong to. Application assignment alone does not grant access to every resource.</p>
    <div class="teams-workspace__acl-grid"><label class="teams-workspace__field"><span>Application / plugin</span><input [(ngModel)]="aclPlugin" name="aclPlugin" placeholder="documents"></label><label class="teams-workspace__field"><span>Resource type</span><input [(ngModel)]="aclType" name="aclType" placeholder="folder"></label><label class="teams-workspace__field"><span>Resource ID</span><input [(ngModel)]="aclId" name="aclId" placeholder="Resource identifier"></label><button type="button" class="teams-workspace__button" (click)="loadAcl()" [disabled]="busy||!aclReady">Load policy</button></div>
    @if (aclLoaded) {
      <div class="teams-workspace__acl-editor"><strong>Team grants</strong>@for (team of teams; track team) {
      <div class="teams-workspace__grant"><span>{{team.name}}</span>@for (permission of resourcePermissions; track permission) {
      <label><input type="checkbox" [checked]="grantHas(team.id,permission)" (change)="toggleGrant(team.id,permission,$any($event.target).checked)">{{permission}}</label>
    }</div>
    }<strong>Individual exceptions</strong>@for (item of userOverrides; track item) {
    <div class="teams-workspace__grant"><span>{{memberEmail(item.userId)}}</span><small>{{item.effect}} · {{item.permissions.join(', ')}}</small><button type="button" class="teams-workspace__text-button" (click)="removeOverride(item.userId)">Remove</button></div>
    }<div class="teams-workspace__acl-grid"><label class="teams-workspace__field"><span>Organization member</span><select [(ngModel)]="overrideUserId" name="overrideUserId"><option value="">Choose a member</option>@for (member of allMembers; track member) {
    <option [value]="member.userId">{{member.email}}</option>
    }</select></label><label class="teams-workspace__field"><span>Exception</span><select [(ngModel)]="overrideEffect" name="overrideEffect"><option value="deny">Deny (takes priority)</option><option value="allow">Allow (within tenant policy)</option></select></label></div><div class="teams-workspace__permission-list">@for (permission of resourcePermissions; track permission) {
    <label><input type="checkbox" [checked]="overridePermissions.includes(permission)" (change)="toggleOverride(permission,$any($event.target).checked)">{{permission}}</label>
    }</div><div class="teams-workspace__acl-actions"><button type="button" class="teams-workspace__button teams-workspace__button--primary" (click)="saveAcl()" [disabled]="busy">Save policy</button><button type="button" class="teams-workspace__button teams-workspace__button--danger" (click)="resetAcl()" [disabled]="busy">Reset to defaults</button></div></div>
  }
</div>
</details>
}
@if (toastMessage) {
  <div class="teams-workspace__toast" role="status" aria-live="polite"><span class="teams-workspace__toast-icon" aria-hidden="true">✓</span><span class="teams-workspace__toast-message">{{toastMessage}}</span><button type="button" (click)="dismissToast()" aria-label="Dismiss notification">×</button></div>
}
</section>`,
 changeDetection: ChangeDetectionStrategy.Eager,
 styles:[`
.teams-workspace{--teams-surface:var(--bee-surface);--teams-bg:var(--bee-bg);--teams-muted:var(--bee-text-muted);--teams-border:var(--bee-border);--teams-accent:var(--bee-accent);display:grid;gap:18px;min-width:0;color:inherit}
.teams-workspace *{box-sizing:border-box}
.teams-workspace__header,.teams-workspace__header-actions,.teams-workspace__toolbar,.teams-workspace__toolbar-actions,.teams-workspace__section-heading,.teams-workspace__composer-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
.teams-workspace__header{align-items:flex-end}.teams-workspace__header h2{font-size:clamp(22px,2vw,28px);letter-spacing:-.035em;margin:4px 0}.teams-workspace__header p{margin:0;color:var(--teams-muted);font-size:13px;max-width:620px;line-height:1.5}.teams-workspace__eyebrow{font-size:9px;font-weight:750;letter-spacing:.13em;color:var(--teams-muted)}

.teams-workspace button,.teams-workspace input,.teams-workspace select{font:inherit}.teams-workspace button{cursor:pointer}.teams-workspace button:disabled{opacity:.45;cursor:not-allowed}
.teams-workspace__button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--teams-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}.teams-workspace__button:hover:not(:disabled){background:color-mix(in srgb,var(--teams-accent) 10%,transparent);border-color:color-mix(in srgb,var(--teams-accent) 55%,var(--teams-border))}.teams-workspace__button:active:not(:disabled){transform:translateY(1px)}.teams-workspace__button--primary{background:var(--teams-accent);border-color:var(--teams-accent);color:var(--bee-action-text)}.teams-workspace__button--primary:hover:not(:disabled){background:color-mix(in srgb,var(--teams-accent) 86%,var(--teams-bg));border-color:var(--teams-accent)}.teams-workspace__button--danger{color:var(--bee-status-danger)}.teams-workspace__icon-button{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--teams-border);border-radius:8px;background:var(--teams-surface);color:inherit;font-size:18px}
.teams-workspace__feedback{margin:0;padding:9px 12px;border-radius:8px;font-size:12px}.teams-workspace__feedback--error{color:var(--bee-status-danger);background:color-mix(in srgb,var(--bee-status-danger) 9%,transparent)}
.teams-workspace__overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:var(--bee-overlay);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:teams-modal-in .16s ease-out}
.teams-workspace__composer{width:min(760px,100%);max-height:min(84vh,820px);overflow:auto;border:1px solid var(--teams-border);background:var(--teams-surface);border-radius:16px;padding:20px;display:grid;gap:16px;box-shadow:var(--bee-shadow-raised);animation:teams-modal-panel-in .2s ease-out}
.teams-workspace__header--actions{justify-content:flex-end}.teams-workspace__header-actions{width:100%;justify-content:flex-end;gap:9px}
@keyframes teams-modal-in{from{opacity:0}to{opacity:1}}
@keyframes teams-modal-panel-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}.teams-workspace__composer-heading h3{margin:3px 0 0;font-size:15px}.teams-workspace__form-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.35fr) minmax(145px,.8fr) auto;align-items:end;gap:10px}.teams-workspace__field{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:650;color:var(--teams-muted)}.teams-workspace__field small{font-size:10px;font-weight:450;margin-inline-start:4px}.teams-workspace__field input,.teams-workspace__field select,.teams-workspace__autocomplete input{width:100%;min-width:0;height:35px;padding:0 10px;border:1px solid var(--teams-border);border-radius:7px;background:var(--teams-bg);color:inherit;font-size:12px;outline:none}.teams-workspace__field input:focus,.teams-workspace__field select:focus,.teams-workspace__autocomplete input:focus,.teams-workspace__search:focus-within{border-color:var(--teams-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--teams-accent) 20%,transparent)}.teams-workspace__field input::placeholder,.teams-workspace__autocomplete input::placeholder{color:var(--teams-muted)}.teams-workspace__save{height:35px}
.teams-workspace__advanced{display:grid;grid-template-columns:1fr 1fr;gap:10px}.teams-workspace__editor-details{border-top:1px solid var(--teams-border);padding-top:10px;min-width:0}.teams-workspace__editor-details summary{cursor:pointer;font-size:12px;font-weight:700;list-style:none;display:flex;align-items:center;gap:8px}.teams-workspace__editor-details summary::-webkit-details-marker{display:none}.teams-workspace__detail-count{display:grid;place-items:center;min-width:20px;height:20px;border-radius:20px;background:color-mix(in srgb,var(--teams-accent) 15%,transparent);color:var(--teams-accent);font-size:10px}.teams-workspace__member-picker{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:10px}.teams-workspace__check{display:flex;align-items:center;gap:6px;font-size:11px;color:inherit}.teams-workspace__check input,.teams-workspace__permission-list input{accent-color:var(--teams-accent)}.teams-workspace__application-editor{padding-top:8px}.teams-workspace__muted{font-size:11px;color:var(--teams-muted);margin:0 0 9px;line-height:1.5}.teams-workspace__autocomplete{display:flex;gap:7px}.teams-workspace__autocomplete input{flex:1}.teams-workspace__chips,.teams-workspace__app-tags{display:flex;gap:5px;flex-wrap:wrap;align-items:center}.teams-workspace__chips{margin:9px 0}.teams-workspace__chip{display:inline-flex;align-items:center;gap:6px;padding:4px 7px;border-radius:6px;background:color-mix(in srgb,var(--teams-accent) 12%,transparent);color:inherit;font-size:10px}.teams-workspace__chip button{border:0;background:transparent;color:inherit;padding:0;font-size:14px;line-height:1}.teams-workspace__suggestions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}.teams-workspace__suggestions>span{font-size:10px;color:var(--teams-muted)}.teams-workspace__suggestions button{border:1px solid var(--teams-border);border-radius:6px;background:transparent;color:inherit;padding:4px 7px;font-size:10px}.teams-workspace__suggestions small{color:var(--teams-muted);margin-inline-start:4px}
.teams-workspace__directory{display:grid;gap:14px;min-width:0}.teams-workspace__toolbar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:14px;margin:0 0 22px;min-width:0}.teams-workspace__toolbar-filters{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,3fr) minmax(0,3fr);align-items:center;gap:8px;width:100%;min-width:0}.teams-workspace__toolbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;min-width:0}.teams-workspace__search{display:flex;align-items:center;gap:8px;width:100%;flex:none;min-width:0;height:36px;padding:0 10px;border:1px solid var(--teams-border);border-radius:8px;background:var(--teams-surface);color:var(--teams-muted)}.teams-workspace__search>span{font-size:20px;opacity:.65}.teams-workspace__search input{border:0;outline:0;min-width:0;flex:1;background:transparent;color:inherit;font-size:12px}.teams-workspace__search input::placeholder{color:inherit;opacity:.48}.teams-workspace__search button{border:0;background:transparent;color:inherit;font-size:16px}.teams-workspace__search:focus-within,.teams-workspace__status-filter:focus-visible{border-color:var(--teams-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--teams-accent) 20%,transparent);outline:0}.teams-workspace__status-filter{width:100%;height:36px;min-width:0;flex:none;padding:0 10px;border:1px solid var(--teams-border);border-radius:8px;background:var(--teams-surface);color:inherit;font-size:11px}.teams-workspace__view-toggle{display:flex;align-items:center;gap:5px;padding:5px;border:0;border-radius:10px;background:transparent;flex:0 0 auto}.teams-workspace__view-toggle button{display:grid;place-items:center;width:34px;height:32px;border:1px solid var(--teams-border);border-radius:7px;background:transparent;color:var(--teams-muted);font:inherit;font-size:17px;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease}.teams-workspace__view-toggle button:hover{border-color:var(--teams-accent);color:inherit}.teams-workspace__view-toggle button.is-active{border-color:var(--teams-accent);background:var(--teams-accent);color:var(--bee-action-text)}.teams-workspace__view-toggle button:focus-visible,.teams-workspace__toolbar-create:focus-visible{outline:2px solid var(--teams-accent);outline-offset:2px}.teams-workspace__toolbar-create{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--teams-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}.teams-workspace__toolbar-create:hover{background:color-mix(in srgb,var(--teams-accent) 10%,transparent);border-color:color-mix(in srgb,var(--teams-accent) 55%,var(--teams-border))}.teams-workspace__toolbar-create:active{transform:translateY(1px)}
.teams-workspace__section-heading{border-bottom:1px solid var(--teams-border);padding-bottom:10px}.teams-workspace__section-heading h3{font-size:14px;margin:0 0 3px}.teams-workspace__section-heading span{font-size:10px;color:var(--teams-muted)}.teams-workspace__text-button{border:0;background:transparent;color:var(--teams-accent);font-size:11px;font-weight:650;padding:5px}
.teams-workspace__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,245px),1fr));gap:12px}.teams-workspace__card{position:relative;min-width:0;border:1px solid var(--teams-border);border-radius:11px;background:var(--teams-surface);padding:13px;display:grid;gap:10px;transition:border-color .16s,background .16s}.teams-workspace__card:hover{border-color:color-mix(in srgb,var(--teams-accent) 48%,var(--teams-border));background:color-mix(in srgb,var(--teams-surface) 92%,var(--teams-accent))}.teams-workspace__card.is-selected{border-color:color-mix(in srgb,var(--teams-accent) 55%,var(--teams-border))}.teams-workspace__card-top{display:flex;justify-content:space-between;align-items:center}.teams-workspace__team-mark{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--teams-accent) 13%,var(--teams-bg));color:var(--teams-accent);font-weight:750;font-size:14px}.teams-workspace__card-menu,.teams-workspace__table-menu{position:relative}.teams-workspace__card-menu summary,.teams-workspace__table-menu summary{list-style:none;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:7px;color:var(--teams-muted);font-size:21px;line-height:1}.teams-workspace__card-menu summary::-webkit-details-marker,.teams-workspace__table-menu summary::-webkit-details-marker{display:none}.teams-workspace__card-menu summary:hover,.teams-workspace__table-menu summary:hover{background:color-mix(in srgb,var(--teams-muted) 12%,transparent);color:inherit}.teams-workspace__menu{position:absolute;z-index:5;inset-block-start:30px;inset-inline-end:0;width:190px;padding:5px;border:1px solid var(--teams-border);border-radius:9px;background:var(--teams-surface);box-shadow:var(--bee-shadow-raised);display:grid;gap:2px}.teams-workspace__menu button{border:0;border-radius:6px;background:transparent;color:inherit;text-align:start;padding:8px;font-size:11px}.teams-workspace__menu button:hover{background:color-mix(in srgb,var(--teams-muted) 12%,transparent)}.teams-workspace__menu button.is-danger{color:var(--bee-status-danger)}
.teams-workspace__card-main{display:grid;gap:4px;text-align:start;border:0;background:transparent;color:inherit;padding:0;min-width:0}.teams-workspace__card-main strong{font-size:14px;overflow-wrap:anywhere}.teams-workspace__card-description{font-size:11px;color:var(--teams-muted);line-height:1.4;min-height:30px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.teams-workspace__card-meta{display:flex;align-items:center;gap:8px;border-top:1px solid var(--teams-border);padding-top:9px}.teams-workspace__card-meta>div:nth-child(2){display:grid;gap:1px}.teams-workspace__card-meta>div:nth-child(2) strong{font-size:11px}.teams-workspace__card-meta>div:nth-child(2) small{font-size:9px;color:var(--teams-muted)}.teams-workspace__status{margin-inline-start:auto;display:inline-flex;align-items:center;border-radius:20px;padding:4px 7px;background:color-mix(in srgb,var(--bee-status-success) 12%,transparent);color:var(--bee-status-success);font-size:9px;text-transform:capitalize}.teams-workspace__status.is-archived{background:color-mix(in srgb,var(--teams-muted) 14%,transparent);color:var(--teams-muted)}.teams-workspace__card-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;min-width:0}.teams-workspace__app-tags span{border:1px solid var(--teams-border);border-radius:5px;padding:3px 5px;font-size:9px;color:var(--teams-muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.teams-workspace__app-tags span.is-empty{border-color:transparent;padding-inline:0}.teams-workspace__parent{font-size:9px;color:var(--teams-muted);white-space:nowrap}
.teams-workspace__table-wrap{width:100%;overflow-x:auto;border:1px solid var(--teams-border);border-radius:10px}.teams-workspace table{width:100%;border-collapse:collapse;min-width:620px}.teams-workspace th{text-align:start;color:var(--teams-muted);font-size:10px;font-weight:650;background:color-mix(in srgb,var(--teams-muted) 6%,var(--teams-surface));padding:10px 12px}.teams-workspace td{padding:9px 12px;border-top:1px solid var(--teams-border);font-size:11px}.teams-workspace tbody tr{transition:background-color .16s ease}.teams-workspace tbody tr:hover{background:color-mix(in srgb,var(--teams-accent) 5%,transparent)}.teams-workspace__table-team{display:flex;align-items:center;gap:9px;border:0;background:transparent;color:inherit;text-align:start;padding:0}.teams-workspace__table-team>span:last-child{display:grid;gap:3px}.teams-workspace__table-team strong{font-size:11px}.teams-workspace__table-team small{font-size:10px;color:var(--teams-muted)}.teams-workspace__table-count{font-size:10px;color:var(--teams-muted)}.teams-workspace__table-count>span{font-weight:750;color:inherit}.teams-workspace__table-menu .teams-workspace__menu{inset-block-start:26px}
.teams-workspace__empty{min-height:160px;border:1px dashed var(--teams-border);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;text-align:center;padding:22px;color:var(--teams-muted)}.teams-workspace__empty strong{color:inherit;font-size:13px}.teams-workspace__empty>span:not(.teams-workspace__empty-icon):not(.teams-workspace__loader){font-size:11px;max-width:330px}.teams-workspace__empty-icon{font-size:24px;color:var(--teams-accent)}.teams-workspace__loader{width:18px;height:18px;border:2px solid var(--teams-border);border-top-color:var(--teams-accent);border-radius:50%;animation:teams-spin .8s linear infinite}@keyframes teams-spin{to{transform:rotate(360deg)}}
.teams-workspace__acl{border:1px solid var(--teams-border);border-radius:10px;background:var(--teams-surface);padding:0 13px}.teams-workspace__acl>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.teams-workspace__acl>summary::-webkit-details-marker{display:none}.teams-workspace__acl>summary>span:first-child{display:grid;gap:3px}.teams-workspace__acl>summary strong{font-size:12px}.teams-workspace__acl>summary small{font-size:10px;color:var(--teams-muted)}.teams-workspace__acl-arrow{color:var(--teams-muted)}.teams-workspace__acl-content{border-top:1px solid var(--teams-border);padding:12px 0}.teams-workspace__acl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;align-items:end;gap:9px}.teams-workspace__acl-editor{padding-top:12px}.teams-workspace__grant{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--teams-border);font-size:11px}.teams-workspace__grant>span{min-width:130px;font-weight:650}.teams-workspace__grant label,.teams-workspace__permission-list label{display:flex;align-items:center;gap:5px}.teams-workspace__permission-list,.teams-workspace__acl-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}.teams-workspace__sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:850px){.teams-workspace__form-row{grid-template-columns:repeat(2,minmax(0,1fr))}.teams-workspace__save{justify-self:start}.teams-workspace__acl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.teams-workspace__toolbar{grid-template-columns:1fr;gap:10px}.teams-workspace__toolbar-filters,.teams-workspace__toolbar-actions{width:100%}.teams-workspace__toolbar-actions{justify-content:flex-end}}
@media(max-width:600px){.teams-workspace{gap:14px}.teams-workspace__header{align-items:flex-start}.teams-workspace__header p{max-width:260px}.teams-workspace__header-actions{gap:8px}.teams-workspace__form-row,.teams-workspace__advanced,.teams-workspace__acl-grid{grid-template-columns:1fr}.teams-workspace__toolbar{grid-template-columns:minmax(0,1fr);gap:10px}.teams-workspace__toolbar-filters{grid-template-columns:minmax(0,4fr) minmax(0,3fr) minmax(0,3fr)}.teams-workspace__toolbar-actions{justify-content:flex-end}.teams-workspace__search{width:100%}.teams-workspace__cards{grid-template-columns:1fr}.teams-workspace__composer{padding:16px}.teams-workspace__overlay{padding:12px}.teams-workspace__card-description{min-height:0}}
@media(prefers-reduced-motion:reduce){.teams-workspace__card,.teams-workspace__loader,.teams-workspace__overlay,.teams-workspace__composer,.teams-workspace__toast{transition:none;animation:none}}
.teams-workspace :is(button,input,select,summary):focus-visible{outline:2px solid var(--teams-accent);outline-offset:2px}
.teams-workspace .documents__button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid var(--teams-border);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;line-height:1.2;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,transform .16s ease}.teams-workspace .documents__button:hover:not(:disabled){background:color-mix(in srgb,var(--teams-accent) 10%,transparent);border-color:color-mix(in srgb,var(--teams-accent) 55%,var(--teams-border))}.teams-workspace .documents__button:focus-visible{outline:2px solid var(--bee-secondary);outline-offset:2px}.teams-workspace .documents__button:active:not(:disabled){transform:translateY(1px)}.teams-workspace .documents__button:disabled{cursor:not-allowed;opacity:.48}

.teams-workspace__toast{position:fixed;inset-inline-end:24px;inset-block-end:24px;z-index:10001;display:flex;align-items:center;gap:10px;width:min(380px,calc(100vw - 32px));padding:12px 14px;border:1px solid var(--teams-border);border-inline-start:3px solid var(--bee-status-success);border-radius:12px;background:var(--teams-surface);color:inherit;box-shadow:var(--bee-shadow-raised);font-size:12px;animation:teams-toast-in .18s ease-out}.teams-workspace__toast-icon{display:grid;place-items:center;width:22px;height:22px;flex:0 0 22px;border-radius:50%;background:color-mix(in srgb,var(--bee-status-success) 14%,transparent);color:var(--bee-status-success);font-weight:800}.teams-workspace__toast-message{flex:1;min-width:0;line-height:1.45}.teams-workspace__toast button{width:26px;height:26px;flex:0 0 26px;border:0;border-radius:6px;background:transparent;color:var(--teams-muted);font-size:18px;line-height:1}.teams-workspace__toast button:hover{background:color-mix(in srgb,var(--teams-muted) 12%,transparent);color:inherit}@keyframes teams-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:600px){.teams-workspace__toolbar-filters{width:100%;flex:1 1 100%;grid-template-columns:minmax(0,4fr) minmax(108px,3fr) minmax(0,3fr)}.teams-workspace__search{width:100%;flex:none;min-width:0}.teams-workspace__status-filter{width:100%;max-width:none;min-width:0;flex:none}.teams-workspace__view-toggle{margin-inline-start:auto}.teams-workspace__toast{inset-inline:16px;inset-block-end:16px;width:auto}}
`]
})
export class TeamsWorkspaceComponent implements OnChanges, OnDestroy {
 @Input({required:true}) tenantId="";
 @Input() role="member";
 @Input() accessToken="";
 teams:Team[]=[];
 allMembers:Member[]=[];
 selected:Team|null=null;
 selectedMemberIds:string[]=[];
 selectedApplications:string[]=[];
 name="";
 description="";
 parentTeamId="";
 pluginInput="";
 loading=false;
 busy=false;
 error="";
 toastMessage="";
 private toastTimer:ReturnType<typeof setTimeout>|null=null;
 composerOpen=false;
 composerMode:"create"|"edit"|"manage"="create";
 search="";
 statusFilter:"all"|"active"|"archived"="all";
 view:TeamView="cards";
 applicationCatalog:{id:string;label:string}[]=[];
 aclPlugin="documents";
 aclType="folder";
 aclId="";
 aclLoaded=false;
 overrideUserId="";
 overrideEffect:"allow"|"deny"="deny";
 overridePermissions:string[]=[];
 teamGrants:{teamId:string;permissions:string[]}[]=[];
 userOverrides:{userId:string;effect:"allow"|"deny";permissions:string[]}[]=[];
 readonly resourcePermissions=["read","write","delete"];
 get canManage(){return ["owner","admin","super_admin"].includes(this.role);}
 get aclReady(){return !!this.aclPlugin.trim()&&!!this.aclType.trim()&&!!this.aclId.trim();}
 get filteredTeams(){const query=this.search.trim().toLowerCase();return this.teams.filter(team=>(this.statusFilter==="all"||team.status===this.statusFilter)&&(!query||team.name.toLowerCase().includes(query)||team.description.toLowerCase().includes(query)||team.applications.some(app=>app.toLowerCase().includes(query))));}
 get matchingApplications(){const query=this.pluginInput.trim().toLowerCase();if(!query)return [];return this.applicationCatalog.filter(app=>(app.id.includes(query)||app.label.toLowerCase().includes(query))&&!this.selectedApplications.includes(app.id)).slice(0,5);}
 ngOnChanges(changes:SimpleChanges){if(changes["tenantId"]||changes["accessToken"]||changes["role"])void this.load();}
 ngOnDestroy(){this.dismissToast();}
 showToast(message:string){this.dismissToast();this.toastMessage=message;this.toastTimer=setTimeout(()=>this.dismissToast(),3500);}
 dismissToast(){if(this.toastTimer!==null){clearTimeout(this.toastTimer);this.toastTimer=null;}this.toastMessage="";}
 private async request(path:string,method="GET",body?:unknown){const response=await fetch("/api"+path,{method,headers:{authorization:"Bearer "+this.accessToken,...(body?{"content-type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Team request failed");return result;}
 async load(){if(!this.tenantId||!this.accessToken)return;this.loading=true;this.error="";try{const [teams,members]=await Promise.all([this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams"),this.request("/companies/"+encodeURIComponent(this.tenantId)+"/memberships")]);this.teams=teams.teams||[];this.allMembers=(members.memberships||[]).filter((item:any)=>item.status==="active").map((item:any)=>({userId:item.userId,email:item.email||item.userId}));try{const marketplace=await this.request("/marketplace/plugins");this.applicationCatalog=(marketplace.plugins||[]).filter((plugin:any)=>plugin.entitled&&plugin.installed&&plugin.enabled!==false).map((plugin:any)=>({id:String(plugin.pluginKey||plugin.id),label:String(plugin.name||plugin.pluginKey||plugin.id)}));}catch{this.applicationCatalog=[];}if(this.selected)this.selected=this.teams.find((item:Team)=>item.id===this.selected?.id)||null;}catch(e){this.error=e instanceof Error?e.message:"Could not load teams";}finally{this.loading=false;}}
 startCreate(){this.reset();this.composerMode="create";this.composerOpen=true;}
 closeComposer(){this.composerOpen=false;this.reset();}
 reset(){this.selected=null;this.name="";this.description="";this.parentTeamId="";this.selectedMemberIds=[];this.selectedApplications=[];this.pluginInput="";}
 select(team:Team){this.selected=team;this.name=team.name;this.description=team.description;this.parentTeamId=team.parentTeamId||"";this.selectedApplications=[...team.applications];void this.loadMembers(team.id);}
 editTeam(team:Team){if(!this.canManage)return;this.select(team);this.composerMode="edit";this.composerOpen=true;}
 manageTeam(team:Team){if(!this.canManage)return;this.select(team);this.composerMode="manage";this.composerOpen=true;}
 async loadMembers(id:string){try{const result=await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(id)+"/members");this.selectedMemberIds=(result.members||[]).map((item:Member)=>item.userId);}catch(e){this.error=e instanceof Error?e.message:"Could not load team members";}}
 async save(event:Event){event.preventDefault();this.busy=true;this.error="";try{const path="/companies/"+encodeURIComponent(this.tenantId)+"/teams"+(this.selected?"/"+encodeURIComponent(this.selected.id):"");const result=await this.request(path,this.selected?"PUT":"POST",{name:this.name,description:this.description,parentTeamId:this.parentTeamId||null});this.showToast("Team saved.");await this.load();this.select(this.teams.find(item=>item.id===result.team.id)||result.team);this.composerMode="edit";this.composerOpen=true;}catch(e){this.error=e instanceof Error?e.message:"Could not save team";}finally{this.busy=false;}}
 toggleMember(id:string,checked:boolean){this.selectedMemberIds=checked?[...new Set([...this.selectedMemberIds,id])]:this.selectedMemberIds.filter(item=>item!==id);}
 async saveMembers(){if(!this.selected)return;this.busy=true;try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(this.selected.id)+"/members","PUT",{userIds:this.selectedMemberIds});this.showToast("Team membership updated.");await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not update members";}finally{this.busy=false;}}
 applicationLabel(id:string){return this.applicationCatalog.find(app=>app.id===id)?.label||id;}
 chooseApplication(id:string){if(!this.selectedApplications.includes(id))this.selectedApplications=[...this.selectedApplications,id];this.pluginInput="";}
 addPlugin(){const typed=this.pluginInput.trim().toLowerCase();if(!typed)return;const match=this.applicationCatalog.find(app=>app.id===typed||app.label.toLowerCase()===typed);const id=match?.id||typed;if(!this.selectedApplications.includes(id))this.selectedApplications=[...this.selectedApplications,id];this.pluginInput="";}
 removePlugin(id:string){this.selectedApplications=this.selectedApplications.filter(item=>item!==id);}
 async saveApplications(){if(!this.selected)return;this.busy=true;try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(this.selected.id)+"/applications","PUT",{pluginIds:this.selectedApplications});this.showToast("Application assignments updated.");await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not update applications";}finally{this.busy=false;}}
 async archive(){if(!this.selected)return;await this.archiveTeam(this.selected);}
 async archiveTeam(team:Team){if(!this.canManage)return;if(!window.confirm("Archive "+team.name+"?"))return;this.busy=true;try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(team.id),"PUT",{status:"archived"});this.showToast("Team archived.");this.closeComposer();await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not archive team";}finally{this.busy=false;}}
 async restoreTeam(team:Team){if(!this.canManage)return;this.busy=true;try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(team.id),"PUT",{status:"active"});this.showToast("Team restored.");await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not restore team";}finally{this.busy=false;}}
 async remove(){if(this.selected)await this.deleteTeam(this.selected);}
 async deleteTeam(team:Team){if(!this.canManage||!window.confirm("Delete "+team.name+"? This cannot be undone."))return;this.busy=true;try{await this.request("/companies/"+encodeURIComponent(this.tenantId)+"/teams/"+encodeURIComponent(team.id),"DELETE");this.showToast("Team deleted.");if(this.selected?.id===team.id)this.closeComposer();await this.load();}catch(e){this.error=e instanceof Error?e.message:"Could not delete team";}finally{this.busy=false;}}
 async loadAcl(){if(!this.aclReady)return;this.busy=true;try{const path="/companies/"+encodeURIComponent(this.tenantId)+"/resource-access/"+encodeURIComponent(this.aclPlugin)+"/"+encodeURIComponent(this.aclType)+"/"+encodeURIComponent(this.aclId);const result=await this.request(path);this.teamGrants=result.policy?.teamGrants||[];this.userOverrides=result.policy?.userOverrides||[];this.overrideUserId="";this.overridePermissions=[];this.aclLoaded=true;}catch(e){this.error=e instanceof Error?e.message:"Could not load resource policy";}finally{this.busy=false;}}
 memberEmail(userId:string){return this.allMembers.find(item=>item.userId===userId)?.email||"Organization member";}
 removeOverride(userId:string){this.userOverrides=this.userOverrides.filter(item=>item.userId!==userId);}
 grantHas(teamId:string,permission:string){return this.teamGrants.some(item=>item.teamId===teamId&&item.permissions.includes(permission));}
 toggleGrant(teamId:string,permission:string,checked:boolean){const row=this.teamGrants.find(item=>item.teamId===teamId);if(!row&&checked)this.teamGrants.push({teamId,permissions:[permission]});else if(row){row.permissions=checked?[...new Set([...row.permissions,permission])]:row.permissions.filter(item=>item!==permission);this.teamGrants=this.teamGrants.filter(item=>item.permissions.length);}}
 toggleOverride(permission:string,checked:boolean){this.overridePermissions=checked?[...new Set([...this.overridePermissions,permission])]:this.overridePermissions.filter(item=>item!==permission);}
 async saveAcl(){if(!this.aclReady)return;this.busy=true;try{const path="/companies/"+encodeURIComponent(this.tenantId)+"/resource-access/"+encodeURIComponent(this.aclPlugin)+"/"+encodeURIComponent(this.aclType)+"/"+encodeURIComponent(this.aclId);const draft=this.overrideUserId.trim()&&this.overridePermissions.length?[{userId:this.overrideUserId.trim(),effect:this.overrideEffect,permissions:this.overridePermissions}]:[];await this.request(path,"PUT",{teamGrants:this.teamGrants,userOverrides:[...this.userOverrides,...draft]});this.showToast("Resource access policy saved.");await this.loadAcl();}catch(e){this.error=e instanceof Error?e.message:"Could not save resource policy";}finally{this.busy=false;}}
 async resetAcl(){if(!this.aclReady||!window.confirm("Remove this resource policy and restore the application's default access?"))return;this.busy=true;try{const path="/companies/"+encodeURIComponent(this.tenantId)+"/resource-access/"+encodeURIComponent(this.aclPlugin)+"/"+encodeURIComponent(this.aclType)+"/"+encodeURIComponent(this.aclId);await this.request(path,"DELETE");this.teamGrants=[];this.userOverrides=[];this.aclLoaded=false;this.showToast("Application default access restored.");}catch(e){this.error=e instanceof Error?e.message:"Could not reset resource policy";}finally{this.busy=false;}}
}
