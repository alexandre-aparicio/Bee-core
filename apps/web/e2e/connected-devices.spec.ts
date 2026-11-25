import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Fixture = {
  accessToken: string;
  tenantId: string;
  user: { id: string; email: string; roles: string[]; tenantId: string };
};

async function authenticate(page: Page, fixture: Fixture): Promise<void> {
  const serialized = JSON.stringify(fixture);
  await page.context().addCookies([{
    name: "bee-test-auth",
    value: encodeURIComponent(serialized),
    url: "http://127.0.0.1:4200",
    sameSite: "Lax"
  }]);
  await page.addInitScript((value: string) => {
    localStorage.setItem("bee-auth", value);
    localStorage.setItem("bee-template-selection", JSON.stringify({ public: "aurora", dashboard: "midnight" }));
  }, serialized);
}

test("Connected Devices ZIP frontend confirms deletion and sends a bodyless DELETE", async ({ page }) => {
  const fixture: Fixture = {
    accessToken: "connected-devices-e2e-token",
    tenantId: "tenant-connected-devices-e2e",
    user: { id: "owner-connected-devices", email: "owner@example.test", roles: ["admin"], tenantId: "tenant-connected-devices-e2e" }
  };
  const entrypoint = await readFile(resolve(process.cwd(), "../../src/plugins/connected-devices/frontend/index.html"), "utf8");
  const script = await readFile(resolve(process.cwd(), "../../src/plugins/connected-devices/frontend/main.js"), "utf8");
  const qr = await readFile(resolve(process.cwd(), "../../src/plugins/connected-devices/frontend/qrcode.min.js"), "utf8");
  const routes = [{ path: "/dashboard/connected-devices", component: "ConnectedDevices" }];
  const state: { devices: any[]; deleteCalls: number; deleteBody: string | null; deleteContentType?: string } = {
    devices: [{
      id: "device-e2e",
      name: "QA Scanner",
      deviceType: "handheld",
      platform: "android",
      appVersion: "1.0.0",
      status: "active",
      requestedCapabilities: ["scanner.use"],
      grantedCapabilities: ["scanner.use"],
      owner: { name: "QA Owner", email: "owner@example.test" },
      lastSeenAt: "2026-11-25T10:00:00.000Z"
    }],
    deleteCalls: 0,
    deleteBody: null
  };

  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    if (path.endsWith("/plugin-packages/connected-devices/0.1.0/assets/frontend/index.html")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: entrypoint });
    }
    if (path.endsWith("/plugin-packages/connected-devices/0.1.0/assets/frontend/main.js")) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: script });
    }
    if (path.endsWith("/plugin-packages/connected-devices/0.1.0/assets/frontend/qrcode.min.js")) {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: qr });
    }

    let status = 200;
    let body: any = {};
    if (path.endsWith("/auth/refresh")) {
      body = { accessToken: fixture.accessToken, tenantId: fixture.tenantId, user: fixture.user, platformRole: null };
    } else if (path.endsWith("/auth/me")) {
      body = { authenticated: true, tenantId: fixture.tenantId, platformRole: null };
    } else if (path.endsWith("/companies")) {
      body = { companies: [{ id: fixture.tenantId, name: "Connected Devices QA", role: "owner", active: true }] };
    } else if (path.endsWith("/companies/active/permissions")) {
      body = { permissions: ["connected-devices.read", "connected-devices.manage", "plugins.install"] };
    } else if (path.endsWith("/marketplace/plugins")) {
      body = { plugins: [{
        id: "connected-devices",
        pluginKey: "connected-devices",
        name: "Connected Devices",
        installed: true,
        enabled: true,
        entitled: true,
        frontendRoutes: routes
      }] };
    } else if (path.endsWith("/marketplace/plugins/connected-devices/runtime")) {
      body = { pluginId: "connected-devices", version: "0.1.0", entrypoint: "frontend/index.html", apiPrefixes: ["/connected-devices"], routes };
    } else if (path.endsWith("/templates/preferences") || path.endsWith("/templates/public")) {
      body = { selection: { public: "aurora", dashboard: "midnight" }, installedTemplates: ["aurora", "editorial", "studio", "midnight", "paper", "glass"] };
    } else if (path.endsWith("/notifications")) {
      body = { notifications: [] };
    } else if (path.endsWith("/i18n/preferences") || path.endsWith("/users/me/preferences")) {
      body = { effectiveLanguage: "en", requestedLanguage: "en" };
    } else if (path.endsWith("/connected-devices") && method === "GET") {
      body = { devices: state.devices, canManage: true };
    } else if (path.endsWith("/connected-devices/device-e2e") && method === "DELETE") {
      state.deleteCalls += 1;
      state.deleteBody = route.request().postData();
      state.deleteContentType = route.request().headers()["content-type"];
      state.devices = [];
      body = { success: true };
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });

  await authenticate(page, fixture);
  await page.goto("/dashboard");
  await expect(page.locator(".bee-dash-company-switcher select")).toHaveValue(fixture.tenantId, { timeout: 15000 });
  await page.getByRole("button", { name: "Connected Devices" }).click();

  const plugin = page.frameLocator('iframe[title="connected-devices plugin"]');
  await expect(plugin.getByRole("heading", { name: "Connected Devices" })).toBeVisible({ timeout: 15000 });
  const card = plugin.locator("article.card").filter({ hasText: "QA Scanner" });
  await expect(card).toBeVisible();

  const menu = card.locator("details.menu");
  await menu.evaluate(element => { (element as HTMLDetailsElement).open = true; });
  await menu.locator('button[data-action="delete"]').click();
  const dialog = plugin.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Delete device permanently?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(state.deleteCalls).toBe(0);

  await menu.evaluate(element => { (element as HTMLDetailsElement).open = true; });
  await menu.locator('button[data-action="delete"]').click();
  await plugin.getByRole("button", { name: "Delete permanently" }).click();
  await expect(plugin.getByText("Device deleted.")).toBeVisible();
  expect(state.deleteCalls).toBe(1);
  expect(state.deleteBody).toBeNull();
  expect(state.deleteContentType).toBeUndefined();
});
