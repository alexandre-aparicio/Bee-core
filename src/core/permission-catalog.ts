/**
 * Canonical permission catalogue for capabilities already implemented in Bee-Core.
 * Persisted keys are a compatibility contract; changing one requires a migration.
 */
export type PermissionDefinition = {
  key: string;
  module: string;
  resource: string;
  action: string;
  label: string;
  description: string;
  sensitive?: boolean;
};

export const CORE_PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: "members.read", module: "organization", resource: "members", action: "read", label: "View members", description: "List members and inspect membership details." },
  { key: "members.invite", module: "organization", resource: "members", action: "invite", label: "Invite members", description: "Create and cancel invitations." },
  { key: "members.manage", module: "organization", resource: "members", action: "manage", label: "Manage memberships", description: "Change membership roles and suspend members.", sensitive: true },
  { key: "plugins.read", module: "plugins", resource: "plugins", action: "read", label: "View plugins", description: "Browse the organization's available plugins." },
  { key: "plugins.install", module: "plugins", resource: "plugins", action: "install", label: "Install plugins", description: "Install or activate available plugins." },
  { key: "plugins.manage", module: "plugins", resource: "plugins", action: "manage", label: "Manage plugins", description: "Change plugin configuration and lifecycle.", sensitive: true },
  { key: "billing.manage", module: "billing", resource: "billing", action: "manage", label: "Manage billing", description: "Manage plans, subscriptions and billing settings.", sensitive: true },
  { key: "files.read", module: "files", resource: "files", action: "read", label: "View files", description: "List and download files available to the organization." },
  { key: "files.write", module: "files", resource: "files", action: "write", label: "Manage files", description: "Upload and modify organization files." },
  { key: "notes.read", module: "notes", resource: "notes", action: "read", label: "View notes", description: "Read notes available to the organization." },
  { key: "notes.write", module: "notes", resource: "notes", action: "write", label: "Manage notes", description: "Create and modify organization notes." },
  { key: "mail.read", module: "mail", resource: "mail", action: "read", label: "Read mail", description: "Read connected mailbox messages." },
  { key: "mail.send", module: "mail", resource: "mail", action: "send", label: "Send mail", description: "Send messages through connected mailboxes." },
  { key: "mail.manage", module: "mail", resource: "mail", action: "manage", label: "Manage mailboxes", description: "Configure and manage organization mailboxes.", sensitive: true }
] as const;

export const CORE_PERMISSION_KEYS = CORE_PERMISSION_CATALOG.map((permission) => permission.key) as readonly string[];
