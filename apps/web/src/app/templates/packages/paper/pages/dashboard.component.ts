import { Component, Input, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { BeeDashboardPageComponent } from '../../shared/dashboard-page.component';
import type { AppComponent } from '../../../../app.component';

@Component({
  selector: 'bee-template-paper-page',
  standalone: true,
  imports: [BeeDashboardPageComponent],
  template: '<bee-template-dashboard-page [vm]="vm" [passSettingsAccessToken]="true"></bee-template-dashboard-page>',
  styles: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None,
})
export class BeePaperPageComponent {
  @Input({ required: true }) vm!: AppComponent;
}
