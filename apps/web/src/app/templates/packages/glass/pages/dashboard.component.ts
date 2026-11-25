import { Component, Input, ViewEncapsulation } from '@angular/core';
import { BeeDashboardPageComponent } from '../../shared/dashboard-page.component';
import type { AppComponent } from '../../../../app.component';

@Component({
  selector: 'bee-template-glass-page',
  standalone: true,
  imports: [BeeDashboardPageComponent],
  template: '<bee-template-dashboard-page [vm]="vm" [guardDocuments]="true" [passSettingsAccessToken]="false"></bee-template-dashboard-page>',
  styles: [],
  encapsulation: ViewEncapsulation.None,
})
export class BeeGlassPageComponent {
  @Input({ required: true }) vm!: AppComponent;
}
