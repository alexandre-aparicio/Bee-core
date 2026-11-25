import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, OnInit, SimpleChanges, ChangeDetectionStrategy } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BeeTranslatePipe } from "../i18n/bee-translate.pipe";

type Note = {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

@Component({
  selector: "bee-notes",
  standalone: true,
  imports: [CommonModule, FormsModule, BeeTranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <section class="panel bee-notes">
      <div class="panel-heading">
        <div><h2>{{ 'notes:title' | beeT }}</h2><p>{{ 'notes:description' | beeT }}</p></div>
        <button type="button" class="bee-notes__refresh" (click)="load()" [disabled]="loading">{{ 'notes:refresh' | beeT }}</button>
      </div>
    
      @if (canWrite) {
        <form class="bee-notes__editor" (submit)="save($event)">
          <label>
            <span>{{editingId ? ('notes:editNote' | beeT) : ('notes:newNote' | beeT)}}</span>
            <input name="noteTitle" [(ngModel)]="draftTitle" maxlength="120" [placeholder]="'notes:noteTitle' | beeT" required>
          </label>
          <label>
            <span>{{ 'notes:content' | beeT }}</span>
            <textarea name="noteContent" [(ngModel)]="draftContent" maxlength="5000" rows="3" [placeholder]="'notes:write' | beeT"></textarea>
          </label>
          <div class="bee-notes__editor-actions">
            <button type="submit" [disabled]="saving || !draftTitle.trim()">{{saving ? ('notes:saving' | beeT) : editingId ? ('notes:save' | beeT) : ('notes:create' | beeT)}}</button>
            @if (editingId) {
              <button type="button" class="bee-notes__secondary" (click)="cancelEdit()">{{ 'notes:cancel' | beeT }}</button>
            }
          </div>
        </form>
      }
    
      @if (error) {
        <div class="bee-notes__error" role="alert">{{error}}</div>
      }
      @if (message) {
        <div class="bee-notes__message" role="status">{{message}}</div>
      }
      @if (loading) {
        <div class="bee-notes__state">{{ 'notes:loading' | beeT }}</div>
      }
      @if (!loading && !error && notes.length === 0) {
        <div class="bee-notes__state">{{ 'notes:empty' | beeT }}</div>
      }
    
      <div class="bee-notes__list">
        @for (note of notes; track trackNote($index, note)) {
          <article class="bee-notes__item">
            <div class="bee-notes__item-head">
              <h3>{{note.title}}</h3>
              <span>{{note.updatedAt | date:'mediumDate'}}</span>
            </div>
            <p>{{note.content}}</p>
            @if (canWrite) {
              <div class="bee-notes__item-actions">
                <button type="button" class="bee-notes__secondary" (click)="edit(note)">{{ 'notes:edit' | beeT }}</button>
                <button type="button" class="bee-notes__danger" (click)="remove(note)" [disabled]="saving">{{ 'notes:delete' | beeT }}</button>
              </div>
            }
          </article>
        }
      </div>
    </section>
    `
})
export class BeeNotesComponent implements OnInit, OnChanges {
  @Input() tenantId = "";
  @Input() canWrite = false;
  @Input() accessToken = "";
  notes: Note[] = [];
  draftTitle = "";
  draftContent = "";
  editingId = "";
  loading = false;
  saving = false;
  error = "";
  message = "";

  ngOnInit(): void { void this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["tenantId"] && !changes["tenantId"].firstChange) void this.load();
  }

  trackNote(_index: number, note: Note): string { return note.id; }

  private get token(): string { return this.accessToken; }

  private async request(url: string, method = "GET", body?: unknown): Promise<any> {
    const response = await fetch(url, {
      method,
      headers: {
        authorization: "Bearer " + this.token,
        ...(body ? { "content-type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Notes request failed");
    return result;
  }

  async load(): Promise<void> {
    if (!this.token) return;
    this.loading = true;
    this.error = "";
    try {
      const result = await this.request("/api/notes");
      this.notes = result.notes || [];
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not load company notes";
      this.notes = [];
    } finally {
      this.loading = false;
    }
  }

  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.draftTitle.trim() || this.saving) return;
    this.saving = true;
    this.error = "";
    this.message = "";
    try {
      const body = { title: this.draftTitle.trim(), content: this.draftContent.trim() };
      if (this.editingId) await this.request("/api/notes/" + encodeURIComponent(this.editingId), "PUT", body);
      else await this.request("/api/notes", "POST", body);
      this.cancelEdit();
      await this.load();
      this.message = "Note saved for this company.";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not save note";
    } finally {
      this.saving = false;
    }
  }

  edit(note: Note): void {
    this.editingId = note.id;
    this.draftTitle = note.title;
    this.draftContent = note.content;
    this.message = "";
    this.error = "";
  }

  cancelEdit(): void {
    this.editingId = "";
    this.draftTitle = "";
    this.draftContent = "";
  }

  async remove(note: Note): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.error = "";
    this.message = "";
    try {
      await this.request("/api/notes/" + encodeURIComponent(note.id), "DELETE");
      this.notes = this.notes.filter(item => item.id !== note.id);
      this.message = "Note deleted.";
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not delete note";
    } finally {
      this.saving = false;
    }
  }
}
