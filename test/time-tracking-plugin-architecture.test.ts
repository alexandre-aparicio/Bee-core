import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Control Horario uses the Core plugin access contract and plugin-owned routes", async () => {
  const root = process.cwd();
  const plugin = await readFile(resolve(root, "src/plugins/time-tracking/time-tracking.plugin.ts"), "utf8");
  const routes = await readFile(resolve(root, "src/plugins/time-tracking/time-tracking.routes.ts"), "utf8");
  const connected = await readFile(resolve(root, "src/plugins/connected-devices/connected-devices.plugin.ts"), "utf8");
  const registrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");

  assert.match(plugin, /core\.plugin-access/);
  assert.match(plugin, /registerTimeTrackingRoutes\(ctx, repository, access\)/);
  assert.match(plugin, /apiPrefixes: \["\\/time-tracking"\]/);
  assert.match(routes, /access\.isPluginAvailable\(tenant\.tenantId, "time-tracking"\)/);
  assert.match(routes, /access\.isTenantUserActive\(tenant\.tenantId, tenant\.userId\)/);
  assert.match(routes, /requireTenantPermissions\("time-tracking\.manage"\)/);
  assert.doesNotMatch(routes, /requireInstalledPlugin/);
  assert.match(connected, /core\.plugin-access/);
  assert.doesNotMatch(registrations, /timeTrackingFrontend/);
});
