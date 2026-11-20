import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BeeTemplateEngine } from './template-engine.service';
import type { BeeTemplateTarget } from './template.types';

@Component({
  selector: 'bee-template-manager',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="bee-template-manager" aria-label="Template manager">
      <div class="bee-template-manager__heading">
        <div><span class="bee-template-manager__eyebrow">APPEARANCE</span><strong>Templates</strong></div>
        <span class="bee-template-manager__status">Live preview</span>
      </div>
      <div class="bee-template-manager__fields">
        <label>Public website
          <select [value]="engine.getSelection().public" (change)="activate('public', $any($event.target).value)">
            <option *ngFor="let item of engine.list('public')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label>Dashboard
          <select [value]="engine.getSelection().dashboard" (change)="activate('dashboard', $any($event.target).value)">
            <option *ngFor="let item of engine.list('dashboard')" [value]="item.id">{{ item.name }}</option>
          </select>
        </label>
      </div>
      <p>Each surface has an independent theme. Your content, plugins, permissions and authentication remain unchanged.</p>
    </section>
  `,
})
export class BeeTemplateManagerComponent {
  constructor(readonly engine: BeeTemplateEngine) {}

  activate(target: BeeTemplateTarget, id: string): void {
    this.engine.activate(target, id);
  }
}
