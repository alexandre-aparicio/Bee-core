import { Pipe, PipeTransform } from '@angular/core';
import { BeeI18nService } from './bee-i18n.service';

@Pipe({ name: 'beeT', standalone: true, pure: false })
export class BeeTranslatePipe implements PipeTransform {
  constructor(private readonly i18n: BeeI18nService) {}
  transform(key: string): string { return this.i18n.t(key); }
}
