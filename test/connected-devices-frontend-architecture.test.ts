import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Connected Devices frontend is compiled as a signed native Angular remote, not in the core bundle", async () => {
  const root = process.cwd();
  const registrations = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-frontend-registrations.ts"), "utf8");
  const hostMain = await readFile(resolve(root, "apps/web/src/main.ts"), "utf8");
  const remoteMain = await readFile(resolve(root, "plugins/connected-devices/frontend/src/main.ts"), "utf8");
  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  const angular = JSON.parse(await readFile(resolve(root, "apps/web/angular.json"), "utf8"));
  const webPackage = JSON.parse(await readFile(resolve(root, "apps/web/package.json"), "utf8"));
  const webLock = JSON.parse(await readFile(resolve(root, "apps/web/package-lock.json"), "utf8"));
  const federation = await readFile(resolve(root, "plugins/connected-devices/frontend/federation.config.mjs"), "utf8");
  const remoteContract = await readFile(resolve(root, "plugins/connected-devices/frontend/src/plugin.component.ts"), "utf8");
  const component = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.ts"), "utf8");
  const componentHtml = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.html"), "utf8");
  const remoteQr = await readFile(resolve(root, "plugins/connected-devices/frontend/src/assets/qrcode.min.js"), "utf8");
  const remoteStyles = await readFile(resolve(root, "plugins/connected-devices/frontend/src/connected-devices.component.css"), "utf8");
  const coreStyles = await readFile(resolve(root, "apps/web/src/app/templates/base/base.css"), "utf8");
  await assert.rejects(access(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts")));
  await assert.rejects(access(resolve(root, "apps/web/src/app/connected-devices/connected-devices.frontend.ts")));
  assert.doesNotMatch(registrations, /connectedDevicesFrontend|connected-devices/);
  assert.match(hostMain, /initFederation/);
  assert.match(remoteMain, /initFederation/);
  assert.match(outlet, /loadRemoteModule/);
  assert.match(outlet, /remoteModule\["PluginComponent"\]/);
  assert.doesNotMatch(outlet, /BeeConnectedDevicesComponent/);
  assert.match(remoteContract, /as PluginComponent/);
  assert.match(outlet, /ViewContainerRef|createComponent/);
  assert.match(federation, /strictVersion:\s*true/);
  assert.match(federation, /singleton:\s*true/);
  assert.match(component, /fetch\("\/api"\s*\+/);
  assert.match(component, /\/connected-devices/);
  assert.match(component, /assetBaseUrl/);
  assert.match(component, /loadQrLibrary/);
  assert.match(outlet, /setInput\("assetBaseUrl"/);
  assert.match(outlet, /markRemoteLoaded/);
  assert.ok(remoteQr.length > 10000, "the QR renderer must ship inside the signed plugin ZIP");
  assert.match(component, /templateUrl:\s*"\.\/connected-devices\.component\.html"/);
  assert.match(component, /styleUrls:\s*\["\.\/connected-devices\.component\.css"\]/);
  assert.match(componentHtml, /bee-connected-devices/);
  assert.match(remoteStyles, /\.bee-device-card/);
  assert.doesNotMatch(coreStyles, /bee-device-card|bee-pairing/);
  assert.ok(angular.projects["connected-devices-remote"], "Connected Devices must have its own Angular remote build target");
  assert.equal(angular.projects["connected-devices-remote"].targets.build.builder, "@angular-architects/native-federation:build");
    assert.equal(angular.projects["connected-devices-remote"].targets.esbuild.builder, "@angular/build:application");
  for (const [name, version] of Object.entries(webPackage.devDependencies)) {
    if (name.startsWith("@angular-") || name.startsWith("@softarc/") || name === "es-module-shims") {
      assert.equal(webLock.packages[""].devDependencies?.[name], version, `apps/web/package-lock.json must pin ${name}`);
    }
  }
});

test("Connected Devices signed ZIP declares and packages its federation remote", async () => {
  const root = process.cwd();
  const builder = await readFile(resolve(root, "scripts/build-plugin-packages.mjs"), "utf8");
  const plugin = await readFile(resolve(root, "src/plugins/connected-devices/connected-devices.plugin.ts"), "utf8");
  const manifest = await readFile(resolve(root, "src/plugins/connected-devices/plugin.manifest.ts"), "utf8");
  const packageConfig = await readFile(resolve(root, "plugins/connected-devices/frontend/federation.config.mjs"), "utf8");
  const host = await readFile(resolve(root, "src/index.ts"), "utf8");
  const marketplace = await readFile(resolve(root, "src/plugins/marketplace/marketplace.plugin.ts"), "utf8");
  const outlet = await readFile(resolve(root, "apps/web/src/app/plugins/plugin-outlet.component.ts"), "utf8");
  assert.match(builder, /frontendDist:\s*process\.env\.BEE_CONNECTED_DEVICES_FEDERATION_DIST/);
  assert.match(builder, /frontend\/remoteEntry\.json/);
  assert.match(builder, /definition\.frontend\.remoteEntry/);
  assert.match(plugin, /version:"0\.3\.1"/);
  assert.match(manifest, /version: "0\.3\.1"/);
  assert.match(packageConfig, /\.\/Component/);
  assert.match(builder, /definition\.frontend\.assets = \[\.\.\.remoteFiles\.keys\(\)\]/);
  assert.match(host, /\/plugin-packages\/:pluginId\/:version\/assets\/\*/);
  assert.doesNotMatch(host, /assets\/:assetToken/);
  assert.doesNotMatch(host, /Native plugin assets require tenant authorization/);
  assert.match(host, /manifest\?\.frontend\?\.assets/);
  assert.doesNotMatch(marketplace, /assetToken|plugin-asset/);
  assert.doesNotMatch(outlet, /assetToken/);
  assert.match(outlet, /\/assets\/frontend\//);
  await assert.rejects(access(resolve(root, "apps/web/src/app/connected-devices/connected-devices.component.ts")));
});
