import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Control Horario is built as a signed Native Federation remote", async () => {
  const root = process.cwd();
  const angular = JSON.parse(await readFile(resolve(root, "apps/web/angular.json"), "utf8"));
  const webPackage = JSON.parse(await readFile(resolve(root, "apps/web/package.json"), "utf8"));
  const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const federation = await readFile(resolve(root, "plugins/time-tracking/frontend/federation.config.mjs"), "utf8");
  const remoteComponent = await readFile(resolve(root, "plugins/time-tracking/frontend/src/plugin.component.ts"), "utf8");
  const remoteMain = await readFile(resolve(root, "plugins/time-tracking/frontend/src/main.ts"), "utf8");
  const builder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  const remoteBuild = await readFile(resolve(root, "scripts/build-time-tracking-remote.mjs"), "utf8");
  const pluginManifest = await readFile(resolve(root, "src/plugins/time-tracking/plugin.manifest.ts"), "utf8");
  const backendPlugin = await readFile(resolve(root, "src/plugins/time-tracking/time-tracking.plugin.ts"), "utf8");

  const project = angular.projects["time-tracking-remote"];
  assert.ok(project, "Control Horario must have a dedicated Angular project");
  assert.equal(project.architect.build.builder, "@angular-architects/native-federation:build");
  assert.equal(project.architect.esbuild.builder, "@angular/build:application");
  assert.equal(project.architect.serve.options.port, 4202);
  assert.match(webPackage.scripts["build:time-tracking-remote"], /ng build time-tracking-remote/);
  assert.match(rootPackage.scripts["build:plugin-packages"], /build-time-tracking-remote/);
  assert.match(federation, /name: "timeTracking"/);
  assert.match(federation, /"\.\/Component"/);
  assert.match(federation, /strictVersion:\s*true/);
  assert.match(federation, /singleton:\s*true/);
  assert.match(remoteMain, /initFederation/);
  assert.match(remoteComponent, /BeeTimeTrackingComponent as PluginComponent/);
  assert.match(remoteBuild, /plugins\/time-tracking\/frontend\/node_modules/);
  assert.match(builder, /BEE_TIME_TRACKING_FEDERATION_DIST/);
  assert.match(builder, /remoteName: "timeTracking"/);
  assert.match(builder, /definition\.id === "connected-devices"[\\s\\S]*qrcode\.min\.js/);
  assert.match(builder, /frontend\/remoteEntry\.json/);
  assert.match(pluginManifest, /version: "0\.2\.3"/);
  assert.match(backendPlugin, /version: "0\.2\.3"/);
});
