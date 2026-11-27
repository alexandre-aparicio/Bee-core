import type { PluginAccessService } from "../../core/plugin-services.js";

export type ConnectedDeviceCapabilityDefinition = {
  id: string;
  providerPlugin: string;
  label: string;
  description: string;
  group: string;
  order: number;
  operations: string[];
  requiresPlugins?: string[];
};

export interface ConnectedDeviceCapabilityRegistry {
  register(providerPlugin: string, definitions: Omit<ConnectedDeviceCapabilityDefinition, "providerPlugin">[]): void;
  listAvailable(tenantId: string, access: PluginAccessService): Promise<ConnectedDeviceCapabilityDefinition[]>;
  getAvailable(tenantId: string, capabilityId: string, access: PluginAccessService): Promise<ConnectedDeviceCapabilityDefinition | null>;
}

const ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const OPERATION_PATTERN = /^[a-z][a-z0-9.-]*$/;

export class ConnectedDeviceCapabilities implements ConnectedDeviceCapabilityRegistry {
  private readonly definitions = new Map<string, ConnectedDeviceCapabilityDefinition>();

  register(providerPlugin: string, definitions: Omit<ConnectedDeviceCapabilityDefinition, "providerPlugin">[]): void {
    if (!/^[a-z][a-z0-9-]*$/.test(providerPlugin)) throw new Error("Invalid capability provider plugin ID.");
    if (!Array.isArray(definitions) || definitions.length === 0) throw new Error("A capability provider must declare at least one capability.");
    const pending = definitions.map((item) => {
      const id = String(item.id ?? "").trim();
      const label = String(item.label ?? "").trim();
      const description = String(item.description ?? "").trim();
      const group = String(item.group ?? "").trim();
      const operations = [...new Set((item.operations ?? []).map(value => String(value).trim()))];
      const requiresPlugins = [...new Set((item.requiresPlugins ?? []).map(value => String(value).trim()))];
      if (!ID_PATTERN.test(id) || !label || label.length > 80 || !description || description.length > 240 ||
          !group || group.length > 60 || !Number.isInteger(item.order) || item.order < 0 ||
          operations.length === 0 || operations.some(operation => !OPERATION_PATTERN.test(operation)) ||
          requiresPlugins.some(plugin => !/^[a-z][a-z0-9-]*$/.test(plugin))) {
        throw new Error("Invalid Connected Devices capability declaration: " + id);
      }
      return { id, providerPlugin, label, description, group, order: item.order, operations, requiresPlugins };
    });
    for (const item of pending) {
      const existing = this.definitions.get(item.id);
      if (existing && existing.providerPlugin !== providerPlugin) throw new Error("Capability ID is already owned by another plugin: " + item.id);
    }
    for (const item of pending) this.definitions.set(item.id, Object.freeze(item));
  }

  async listAvailable(tenantId: string, access: PluginAccessService): Promise<ConnectedDeviceCapabilityDefinition[]> {
    const providers = [...new Set([...this.definitions.values()].flatMap(item => [item.providerPlugin, ...(item.requiresPlugins ?? [])]))];
    const enabled = new Set<string>();
    for (const provider of providers) if (await access.isPluginAvailable(tenantId, provider)) enabled.add(provider);
    return [...this.definitions.values()]
      .filter(item => enabled.has(item.providerPlugin) && (item.requiresPlugins ?? []).every(plugin => enabled.has(plugin)))
      .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.id.localeCompare(b.id));
  }

  async getAvailable(tenantId: string, capabilityId: string, access: PluginAccessService): Promise<ConnectedDeviceCapabilityDefinition | null> {
    const item = this.definitions.get(capabilityId);
    if (!item || !await access.isPluginAvailable(tenantId, item.providerPlugin)) return null;
    for (const plugin of item.requiresPlugins ?? []) if (!await access.isPluginAvailable(tenantId, plugin)) return null;
    return item;
  }
}
