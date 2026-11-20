import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BeeTemplateSlotRegistry, type BeeTemplateSlotName } from './template-slot-registry.service';

/**
 * Renders trusted, compiled Angular components contributed by UI plugins.
 * Remote manifests cannot provide executable JavaScript or component code.
 */
@Component({
  selector: 'bee-template-slot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bee-template-slot" [attr.data-bee-slot]="name">
      @for (item of contributions; track item.pluginId) {
        <ng-container *ngComponentOutlet="item.component"></ng-container>
      }
    </div>
  `,
})
export class BeeTemplateSlotComponent {
  @Input({ required: true }) name!: BeeTemplateSlotName;

  constructor(private readonly registry: BeeTemplateSlotRegistry) {}

  get contributions() {
    return this.registry.list(this.name);
  }
}
