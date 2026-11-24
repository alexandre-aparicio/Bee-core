import { Component, ViewEncapsulation } from '@angular/core';

@Component({ selector: 'bee-template-midnight-layout', standalone: true, template: '<ng-content></ng-content>', styleUrls: ['../tokens.css', '../styles.css', '../../../core/appearance-modes.css'], encapsulation: ViewEncapsulation.None, host: { class: 'bee-template-package-host bee-template-package-host--midnight' } })
export class BeeMidnightLayoutComponent {}
