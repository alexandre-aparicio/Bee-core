import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity, lucideBell, lucideBuilding2, lucideChevronDown, lucideChevronRight,
  lucideCircleHelp, lucideCreditCard, lucideFileText, lucideGlobe, lucideHouse,
  lucideLanguages, lucideLayoutDashboard, lucideLock, lucideLogOut, lucideMail,
  lucideMenu, lucideMoon, lucidePalette, lucidePlug, lucidePuzzle, lucideServer,
  lucideSettings, lucideShieldCheck, lucideSun, lucideUsers, lucideUsersRound,
  lucideWorkflow, lucideSearch, lucideRefreshCw, lucidePlus, lucideClock, lucideCalendarDays, lucideHistory, lucideClipboardList
} from '@ng-icons/lucide';

const ICONS: Record<string, string> = {
  dashboard: 'lucideLayoutDashboard', organization: 'lucideBuilding2', company: 'lucideBuilding2',
  users: 'lucideUsers', teams: 'lucideUsersRound', roles: 'lucideShieldCheck',
  activity: 'lucideActivity', mail: 'lucideMail', notifications: 'lucideBell',
  settings: 'lucideSettings', plugins: 'lucidePuzzle', general: 'lucideSettings',
  tenants: 'lucideBuilding2', integrations: 'lucidePlug', plans: 'lucideCreditCard',
  security: 'lucideLock', infrastructure: 'lucideServer', localization: 'lucideLanguages',
  themes: 'lucidePalette', domains: 'lucideGlobe', workflow: 'lucideWorkflow',
  clock: 'lucideClock', calendar: 'lucideCalendarDays', history: 'lucideHistory', 'clipboard-list': 'lucideClipboardList',
  documentation: 'lucideFileText', home: 'lucideHouse', menu: 'lucideMenu',
  logout: 'lucideLogOut', search: 'lucideSearch', refresh: 'lucideRefreshCw', plus: 'lucidePlus', chevronDown: 'lucideChevronDown', chevronRight: 'lucideChevronRight',
  light: 'lucideSun', dark: 'lucideMoon', help: 'lucideCircleHelp'
};

@Component({
  selector: 'bee-icon',
  standalone: true,
  imports: [NgIcon],
  providers: [provideIcons({
    lucideActivity, lucideBell, lucideBuilding2, lucideChevronDown, lucideChevronRight,
    lucideCircleHelp, lucideCreditCard, lucideFileText, lucideGlobe, lucideHouse,
    lucideLanguages, lucideLayoutDashboard, lucideLock, lucideLogOut, lucideMail,
    lucideMenu, lucideMoon, lucidePalette, lucidePlug, lucidePuzzle, lucideServer,
    lucideSettings, lucideShieldCheck, lucideSun, lucideUsers, lucideUsersRound,
    lucideWorkflow, lucideSearch, lucideRefreshCw, lucidePlus, lucideClock, lucideCalendarDays, lucideHistory, lucideClipboardList
  })],
  template: '<ng-icon [name]="resolvedIcon" [size]="size" [strokeWidth]="strokeWidth"></ng-icon>',
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [':host{display:inline-flex;align-items:center;justify-content:center;line-height:1;flex:none}ng-icon{display:inline-flex;align-items:center;justify-content:center;}']
})
export class BeeIconComponent {
  @Input() name = 'help';
  @Input() size = '18px';
  @Input() strokeWidth: number | string = 1.8;
  get resolvedIcon(): string { return ICONS[this.name] || 'lucideCircleHelp'; }
}
