import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'bee-template-glass-layout',
  standalone: true,
  template: '<ng-content></ng-content>',
  styleUrls: ['../styles.css', '../../../core/appearance-modes.css'],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'bee-template-package-host bee-template-package-host--glass', 'attr.data-bee-template': 'glass' },
})
export class BeeGlassLayoutComponent {}
