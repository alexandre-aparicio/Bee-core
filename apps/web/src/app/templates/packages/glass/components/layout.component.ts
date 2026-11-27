import { Component, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'bee-template-glass-layout',
  standalone: true,
  template: '<ng-content></ng-content>',
  styleUrls: ['../styles.css', '../../../core/appearance-modes.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'bee-template-package-host bee-template-package-host--glass', 'data-bee-template': 'glass' },
})
export class BeeGlassLayoutComponent {}
