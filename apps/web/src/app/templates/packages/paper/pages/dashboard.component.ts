import { Component, Input, ViewEncapsulation } from '@angular/core';
import { BeeDashboardPageComponent } from '../../shared/dashboard-page.component';
import type { AppComponent } from '../../../../app.component';

@Component({
  selector: 'bee-template-paper-page',
  standalone: true,
  imports: [BeeDashboardPageComponent],
  template: '<bee-template-dashboard-page [vm]="vm" [guardDocuments]="false" [passSettingsAccessToken]="true"></bee-template-dashboard-page>',
  styles: [],
  encapsulation: ViewEncapsulation.None,
})
export class BeePaperPageComponent {
  @Input({ required: true }) vm!: AppComponent;
}
