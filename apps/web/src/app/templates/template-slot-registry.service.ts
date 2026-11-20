import { Injectable, type Type } from '@angular/core';

export type BeeTemplateSlotName = 'header' | 'hero' | 'content' | 'footer' | 'sidebar' | 'topbar' | 'widgets';

export interface BeeTemplateSlotContribution {
  pluginId: string;
  slot: BeeTemplateSlotName;
  component: Type<unknown>;
  order: number;
}

const ALLOWED_SLOTS: BeeTemplateSlotName[] = ['header', 'hero', 'content', 'footer', 'sidebar', 'topbar', 'widgets'];

@Injectable({ providedIn: 'root' })
export class BeeTemplateSlotRegistry {
  private readonly contributions = new Map<BeeTemplateSlotName, BeeTemplateSlotContribution[]>();

  register(input: Omit<BeeTemplateSlotContribution, 'order'> & { order?: number }): () => void {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.pluginId)) throw new Error('Invalid UI plugin id');
    if (!ALLOWED_SLOTS.includes(input.slot)) throw new Error('Unsupported template slot');
    const current = this.contributions.get(input.slot) ?? [];
    if (current.some(item => item.pluginId === input.pluginId)) throw new Error(`Plugin '${input.pluginId}' already contributes to slot '${input.slot}'`);
    const contribution: BeeTemplateSlotContribution = { ...input, order: input.order ?? 100 };
    this.contributions.set(input.slot, [...current, contribution].sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId)));
    return () => this.unregister(input.pluginId, input.slot);
  }

  list(slot: BeeTemplateSlotName): readonly BeeTemplateSlotContribution[] {
    return [...(this.contributions.get(slot) ?? [])];
  }

  unregister(pluginId: string, slot?: BeeTemplateSlotName): void {
    const targets = slot ? [slot] : ALLOWED_SLOTS;
    for (const target of targets) {
      const remaining = (this.contributions.get(target) ?? []).filter(item => item.pluginId !== pluginId);
      if (remaining.length) this.contributions.set(target, remaining);
      else this.contributions.delete(target);
    }
  }
}
