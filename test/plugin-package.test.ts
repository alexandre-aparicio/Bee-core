import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePluginManifest, type BeeBusinessPluginManifest } from "../src/core/plugin-package.js";

const validManifest: BeeBusinessPluginManifest = {
  id: "crm.contacts",
  name: "CRM Contacts",
  version: "1.0.0",
  publisher: "Bee Projects",
  description: "Company-scoped contact management",
  category: "crm",
  compatibility: { minRuntimeVersion: "0.3.0" },
  dependencies: [{ pluginId: "core.audit", versionRange: "^1.0.0", optional: true }],
  permissions: [{ key: "crm.contacts.read", description: "Read company contacts" }],
  backend: { entrypoint: "dist/backend/index.js" },
  frontend: { routes: [{ path: "/crm/contacts", component: "crm.contacts.list" }] },
  collections: ["crm_contacts", "crm_contact_notes"],
  migrations: [{ id: "001-create-contacts", checksum: "a".repeat(64), phase: "install" }],
  settingsSchema: { type: "object", properties: {} },
  package: { sha256: "b".repeat(64), signature: "signed-package-digest", storageKey: "packages/crm-contacts/1.0.0.tgz" }
};

test("plugin manifest accepts a complete, versioned and signed package contract", () => {
  assert.doesNotThrow(() => validatePluginManifest(validManifest));
});

test("plugin manifest rejects unsafe paths, invalid IDs, duplicate permissions and invalid digests", () => {
  assert.throws(() => validatePluginManifest({ ...validManifest, id: "../crm" }), /plugin id/);
  assert.throws(() => validatePluginManifest({ ...validManifest, backend: { entrypoint: "../../etc/passwd" } }), /entrypoint/);
  assert.throws(() => validatePluginManifest({ ...validManifest, package: { ...validManifest.package, storageKey: "../outside.tgz" } }), /package digest/);
  assert.throws(() => validatePluginManifest({ ...validManifest, package: { ...validManifest.package, sha256: "bad" } }), /package digest/);
  assert.throws(() => validatePluginManifest({ ...validManifest, permissions: [...validManifest.permissions, ...validManifest.permissions] }), /unique/);
});
