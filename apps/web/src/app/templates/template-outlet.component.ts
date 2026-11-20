import { Component, Input } from '@angular/core';
import { BeeTemplateEngine } from './template-engine.service';
import type { BeeTemplateTarget } from './template.types';

/**
 * Resolves the active manifest to a trusted, compiled Angular layout.
 * Template manifests select a registered layout key; they never execute
 * remote JavaScript or inject arbitrary component code.
 */
@Component({
  selector: 'bee-template-outlet',
  standalone: true,
  template: `
    @switch (layoutId) {
      @case ('public.editorial') {
        <div class="bee-layout bee-layout--public bee-layout--public-editorial" [attr.data-bee-layout]="layoutId"><ng-content /></div>
      }
      @case ('dashboard.paper') {
        <div class="bee-layout bee-layout--dashboard bee-layout--dashboard-paper" [attr.data-bee-layout]="layoutId"><ng-content /></div>
      }
      @case ('dashboard.midnight') {
        <div class="bee-layout bee-layout--dashboard bee-layout--dashboard-midnight" [attr.data-bee-layout]="layoutId"><ng-content /></div>
      }
      @default {
        <div class="bee-layout bee-layout--public bee-layout--public-aurora" [attr.data-bee-layout]="layoutId"><ng-content /></div>
      }
    }
  `,
})
export class BeeTemplateOutletComponent {
  @Input({ required: true }) target!: BeeTemplateTarget;

  constructor(private readonly templates: BeeTemplateEngine) {}

  get layoutId(): string {
    return this.templates.getActive(this.target)?.layout ?? (this.target === 'dashboard' ? 'dashboard.midnight' : 'public.aurora');
  }
}
