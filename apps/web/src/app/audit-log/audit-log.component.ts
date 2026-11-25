import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";

type AuditEvent = { id:string; actorId:string; action:string; outcome:"success"|"denied"; resourceType?:string; resourceId?:string; metadata?:Record<string,string|number|boolean|null>; occurredAt:string };

@Component({
  selector: "bee-audit-log",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section id="activity" class="panel bee-dashboard-card bee-audit-log" *ngIf="canRead">
      <div class="panel-heading">
        <div><h2>Activity log</h2><p>Security and workspace events for the active company.</p></div>
        <div class="bee-audit-log__controls">
          <select aria-label="Audit action" [(ngModel)]="action" (ngModelChange)="load(1)">
            <option value="">All events</option>
            <option *ngFor="let item of actionOptions" [value]="item.value">{{item.label}}</option>
          </select>
          <button type="button" (click)="load(page)" [disabled]="loading">Refresh</button>
        </div>
      </div>
      <div *ngIf="loading" class="bee-audit-log__state">Loading activity…</div>
      <div *ngIf="error" class="bee-audit-log__error bee-status--danger" role="alert">{{error}}</div>
      <div *ngIf="!loading && !events.length && !error" class="bee-audit-log__state">No activity matches this filter.</div>
      <div class="bee-audit-log__table-wrap" *ngIf="events.length">
        <table class="bee-audit-log__table">
          <thead><tr><th>Event</th><th>Actor</th><th>Result</th><th>When</th><th>Details</th></tr></thead>
          <tbody>
            <tr *ngFor="let event of events; trackBy: trackEvent">
              <td><strong>{{label(event.action)}}</strong><small>{{event.resourceType || "workspace"}}</small></td>
              <td><code>{{event.actorId}}</code></td>
              <td><span class="bee-audit-log__outcome" [class.is-denied]="event.outcome === 'denied'" [class.bee-status--danger]="event.outcome === 'denied'" [class.bee-status--success]="event.outcome === 'success'">{{event.outcome}}</span></td>
              <td>{{event.occurredAt | date:"medium"}}</td>
              <td><small>{{details(event)}}</small></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="bee-audit-log__pagination" *ngIf="events.length || page > 1">
        <button type="button" (click)="load(page - 1)" [disabled]="page <= 1 || loading">Previous</button>
        <span>Page {{page}}</span>
        <button type="button" (click)="load(page + 1)" [disabled]="!hasMore || loading">Next</button>
      </div>
    </section>
  `
})
export class AuditLogComponent implements OnChanges {
  @Input() tenantId = "";
  @Input() role = "member";
  @Input() accessToken = "";
  events: AuditEvent[] = [];
  action = "";
  page = 1;
  limit = 20;
  hasMore = false;
  loading = false;
  error = "";
  private requestSequence = 0;
  readonly actionOptions = [
    {value:"auth.login",label:"Logins"},{value:"auth.logout",label:"Logouts"},
    {value:"member.invited",label:"Invitations"},{value:"member.role_changed",label:"Role changes"},
    {value:"member.suspended",label:"Member suspensions"},{value:"invitation.cancelled",label:"Cancelled invitations"},
    {value:"role.created",label:"Roles created"},{value:"role.updated",label:"Roles updated"},{value:"role.deleted",label:"Roles deleted"},
    {value:"permission.denied",label:"Permission denials"},{value:"plugin.installed",label:"Plugin installs"},
    {value:"plugin.updated",label:"Plugin updates"},{value:"plugin.uninstalled",label:"Plugin removals"}
  ];

  get canRead(): boolean { return this.role === "owner" || this.role === "admin"; }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["tenantId"] || changes["role"]) {
      this.requestSequence++;
      this.events = []; this.page = 1; this.hasMore = false; this.error = ""; this.loading = false;
      if (this.canRead && this.tenantId) void this.load(1);
    }
  }

  private get token(): string { return this.accessToken; }

  trackEvent(_index:number,event:AuditEvent):string { return event.id; }
  label(action:string):string { return action.replaceAll(".", " ").replaceAll("_", " "); }
  details(event:AuditEvent):string {
    if (!event.metadata || !Object.keys(event.metadata).length) return event.resourceId || "—";
    return Object.entries(event.metadata).map(([key,value])=>key+": "+String(value)).join(" · ");
  }

  async load(page:number):Promise<void> {
    if (!this.canRead || !this.tenantId || !this.token) return;
    const requestId = ++this.requestSequence;
    const requestedTenantId = this.tenantId;
    const requestedRole = this.role;
    this.loading = true; this.error = "";
    try {
      const params = new URLSearchParams({page:String(page),limit:String(this.limit)});
      if (this.action) params.set("action",this.action);
      const response = await fetch("/api/companies/"+encodeURIComponent(requestedTenantId)+"/audit-events?"+params.toString(), {headers:{authorization:"Bearer "+this.token}});
      const result = await response.json();
      if (requestId !== this.requestSequence || requestedTenantId !== this.tenantId || requestedRole !== this.role) return;
      if (!response.ok) throw new Error(result.error || "Could not load activity");
      this.events = result.events || []; this.page = result.page || page; this.hasMore = Boolean(result.hasMore);
    } catch (error) {
      if (requestId === this.requestSequence) this.error = error instanceof Error ? error.message : "Could not load activity";
    } finally {
      if (requestId === this.requestSequence) this.loading = false;
    }
  }
}
