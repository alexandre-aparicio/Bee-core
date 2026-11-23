import { Component, Input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideActivity, lucideBell, lucideBuilding2, lucideChevronDown, lucideChevronRight,
  lucideCircleHelp, lucideCreditCard, lucideFileText, lucideGlobe, lucideHouse,
  lucideLanguages, lucideLayoutDashboard, lucideLock, lucideLogOut, lucideMail,
  lucideMenu, lucideMoon, lucidePalette, lucidePlug, lucidePuzzle, lucideServer,
  lucideSettings, lucideShieldCheck, lucideSun, lucideUsers, lucideUsersRound,
  lucideWorkflow
} from '@ng-icons/lucide';

const ICONS = {
  dashboard: lucideLayoutDashboard,
  organization: lucideBuilding2,
  company: lucideBuilding2,
  users: lucideUsers,
  teams: lucideUsersRound,
  roles: lucideShieldCheck,
  activity: lucideActivity,
  mail: lucideMail,
  notifications: lucideBell,
  settings: lucideSettings,
  plugins: lucidePuzzle,
  general: lucideSettings,
  tenants: lucideBuilding2,
  integrations: lucidePlug,
  plans: lucideCreditCard,
  security: lucideLock,
  infrastructure: lucideServer,
  localization: lucideLanguages,
  themes: lucidePalette,
  domains: lucideGlobe,
  workflow: lucideWorkflow,
  documentation: lucideFileText,
  home: lucideHouse,
  menu: lucideMenu,
  logout: lucideLogOut,
  chevronDown: lucideChevronDown,
  chevronRight: lucideChevronRight,
  light: lucideSun,
  dark: lucideMoon,
  help: lucideCircleHelp
} as const;

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
    lucideWorkflow
  })],
  template: '<ng-icon [name]="resolvedIcon" [size]="size" [strokeWidth]="strokeWidth"></ng-icon>',
  styles: [':host{display:inline-flex;align-items:center;justify-content:center;line-height:1;flex:none}ng-icon{display:inline-flex;align-items:center;justify-content:center;}']
})
export class BeeIconComponent {
  @Input() name = 'help';
  @Input() size = '18px';
  @Input() strokeWidth: number | string = 1.8;
  get resolvedIcon(): string { return ICONS[this.name as keyof typeof ICONS] ? this.nameToRegistered(this.name) : 'lucideCircleHelp'; }
  private nameToRegistered(name: string): string { return (ICONS[name as keyof typeof ICONS] as { name?: string })?.name || Object.keys(ICONS).includes(name) ? this.iconRegistrationName(name) : 'lucideCircleHelp'; }
  private iconRegistrationName(name: string): string { return 'lucide' + name.charAt(0).toUpperCase() + name.slice(1); }
}
