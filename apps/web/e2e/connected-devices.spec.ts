import { test, expect } from "./quality-gates";

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

test("Connected Devices uses its native Angular frontend and sends a bodyless DELETE", async ({ page }) => {
  const fixture: Fixture = {
    accessToken: "connected-devices-e2e-token",
    tenantId: "tenant-connected-devices-e2e",
    user: { id: "owner-connected-devices", email: "owner@example.test", roles: ["admin"], tenantId: "tenant-connected-devices-e2e" }
  };
  const state: { devices: any[]; deleteCalls: number; deleteBody: string | null; deleteContentType?: string; runtimeCalls: number } = {
    devices: [{
      id: "device-e2e", name: "QA Scanner", deviceType: "handheld", platform: "android", appVersion: "1.0.0",
      status: "active", requestedCapabilities: ["scanner.use"], grantedCapabilities: ["scanner.use"],
      owner: { name: "QA Owner", email: "owner@example.test" }, lastSeenAt: "2026-11-25T10:00:00.000Z"
    }],
    deleteCalls: 0, deleteBody: null, runtimeCalls: 0
  };

  await page.route("**/api/**", async (route: any) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
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
        id: "connected-devices", pluginKey: "connected-devices", name: "Connected Devices",
        installed: true, enabled: true, entitled: true, frontendRoutes: [{ path: "/dashboard/connected-devices", component: "connected-devices" }]
      }] };
    } else if (path.endsWith("/marketplace/plugins/connected-devices/runtime")) {
      state.runtimeCalls += 1;
      body = { pluginId: "connected-devices", version: "0.1.5", entrypoint: "frontend/index.html", apiPrefixes: ["/connected-devices"] };
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
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await authenticate(page, fixture);
  await page.goto("/dashboard");
  await expect(page.locator(".bee-dash-company-switcher select")).toHaveValue(fixture.tenantId, { timeout: 15000 });
  await page.getByRole("button", { name: "Connected Devices" }).click();

  const component = page.locator("bee-connected-devices");
  await expect(component.getByRole("heading", { name: "Connected devices" })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('iframe[title="connected-devices plugin"]')).toHaveCount(0);
  await expect(component.locator(".bee-stat-card")).toHaveCount(4);
  await expect(component.getByText("QA Scanner")).toBeVisible();

  await component.getByRole("searchbox", { name: "Search devices" }).fill("QA");
  await expect(component.getByText("QA Scanner")).toBeVisible();
  await component.getByRole("searchbox", { name: "Search devices" }).fill("no-match");
  await expect(component.getByText("No matching devices")).toBeVisible();
  await component.getByRole("button", { name: "Clear filters" }).click();
  await component.getByRole("button", { name: "Table view" }).click();
  await expect(component.locator(".bee-table-wrap table tbody tr")).toHaveCount(1);
  await component.getByRole("button", { name: "Card view" }).click();

  await component.getByRole("button", { name: "New device" }).click();
  await expect(component.getByRole("dialog", { name: "New device" })).toBeVisible();
  await component.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const device = component.locator("article.bee-device-card").filter({ hasText: "QA Scanner" });
  await device.locator("details.bee-menu summary").click();
  page.once("dialog", dialog => dialog.accept());
  await device.getByRole("menuitem", { name: "Delete" }).click();
  await expect(component.getByText("Action completed.")).toBeVisible();
  expect(state.deleteCalls).toBe(1);
  expect(state.deleteBody).toBeNull();
  expect(state.deleteContentType).toBeUndefined();
  expect(state.runtimeCalls).toBe(0);
});
