import { test, expect } from './quality-gates';
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Fixture = { accessToken: string; tenantId: string; user: { id: string; email: string; roles: string[]; tenantId: string } };

async function authenticate(page: Page, fixture: Fixture): Promise<void> {
  const serialized = JSON.stringify(fixture);
  await page.context().addCookies([{ name: "bee-test-auth", value: encodeURIComponent(serialized), url: "http://127.0.0.1:4200", sameSite: "Lax" }]);
  await page.addInitScript((value: string) => {
    localStorage.setItem("bee-auth", value);
    localStorage.setItem("bee-template-selection", JSON.stringify({ public: "aurora", dashboard: "midnight" }));
  }, serialized);
}

function installApiMocks(page: Page, fixture: Fixture, state: any): Promise<void> {
  return page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    let status = 200;
    let body: any = {};

    // Serve the real, freshly built Native Federation remote from the CI artifact.
    const packageAssetMarker = "/assets/frontend/";
    if (path.includes("/plugin-packages/time-tracking/0.2.3") && path.includes(packageAssetMarker)) {
      const asset = decodeURIComponent(path.split(packageAssetMarker).pop() || "");
      if (!asset || asset.includes("..") || asset.includes("\\\\")) {
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid plugin asset path" }) });
      }
      const assetPath = resolve(process.cwd(), "dist/time-tracking-remote/browser", asset);
      try {
        const content = await readFile(assetPath);
        const extension = assetPath.split(".").pop()?.toLowerCase();
        const contentType = extension === "json" ? "application/json" : extension === "css" ? "text/css" : extension === "html" ? "text/html" : "application/javascript";
        return route.fulfill({ status: 200, contentType, body: content });
      } catch {
        return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Plugin asset not found", asset }) });
      }
    }

    if (path.endsWith("/auth/refresh")) {
      body = { accessToken: fixture.accessToken, tenantId: fixture.tenantId, user: fixture.user, platformRole: null };
    } else if (path.endsWith("/auth/me")) {
      body = { authenticated: true, tenantId: fixture.tenantId, platformRole: null };
    } else if (path.endsWith("/companies")) {
      body = { companies: [{ id: fixture.tenantId, name: "Control Horario QA", role: fixture.user.roles.includes("admin") ? "owner" : "member", active: true }] };
    } else if (path.endsWith("/companies/active/permissions")) {
      body = { permissions: fixture.user.roles.includes("admin") ? ["time-tracking.read", "time-tracking.clock", "time-tracking.manage"] : ["time-tracking.read", "time-tracking.clock"] };
    } else if (path.endsWith("/marketplace/plugins")) {
      body = { plugins: [{
        id: "time-tracking",
        pluginKey: "time-tracking",
        name: "Control Horario",
        frontendRoutes: [{ path: "/dashboard/time-tracking", component: "time-tracking" }],
        installed: true,
        enabled: true,
        entitled: true
      }] };
    } else if (path.endsWith("/marketplace/plugins/time-tracking/runtime")) {
      body = {
        pluginId: "time-tracking",
        version: "0.2.3",
        transport: "native-federation",
        remoteEntry: "frontend/remoteEntry.json",
        remoteName: "timeTracking",
        exposedModule: "./Component",
        apiPrefixes: ["/time-tracking"]
      };
    } else if (path.endsWith("/templates/preferences") || path.endsWith("/templates/public")) {
      body = { selection: { public: "aurora", dashboard: "midnight" }, installedTemplates: ["aurora", "editorial", "studio", "midnight", "paper", "glass"] };
    } else if (path.endsWith("/notifications")) {
      body = { notifications: [] };
    } else if (path.endsWith("/i18n/preferences") || path.endsWith("/users/me/preferences")) {
      body = { effectiveLanguage: "es", requestedLanguage: "es" };
    } else if (path.endsWith("/time-tracking/me/status")) {
      body = { session: state.session?.active ? state.session : null };
    } else if (path.endsWith("/time-tracking/me/sessions")) {
      body = { sessions: state.history };
    } else if (path.endsWith("/time-tracking/me/corrections")) {
      body = { corrections: state.myCorrections };
    } else if (path.endsWith("/time-tracking/me/schedule")) {
      body = { schedule: state.mySchedule };
    } else if (path.endsWith("/time-tracking/team/members")) {
      body = { members: state.members };
    } else if (path.endsWith("/time-tracking/team/schedules")) {
      body = { schedules: state.schedules };
    } else if (path.endsWith("/time-tracking/team/corrections")) {
      body = { corrections: state.teamCorrections.filter((item: any) => item.status === "pending") };
    } else if (path.endsWith("/time-tracking/clock-in") && method === "POST") {
      const now = new Date().toISOString();
      state.session = { id: "session-e2e", status: "working", active: true, startedAt: now, endedAt: null, events: [{ type: "clock_in", occurredAt: now, source: "web" }] };
      status = 201; body = { session: state.session };
    } else if (path.endsWith("/time-tracking/break-start") && method === "POST") {
      const now = new Date().toISOString(); state.session.status = "on_break"; state.session.events.push({ type: "break_start", occurredAt: now, source: "web" }); body = { session: state.session };
    } else if (path.endsWith("/time-tracking/break-end") && method === "POST") {
      const now = new Date().toISOString(); state.session.status = "working"; state.session.events.push({ type: "break_end", occurredAt: now, source: "web" }); body = { session: state.session };
    } else if (path.endsWith("/time-tracking/clock-out") && method === "POST") {
      const now = new Date().toISOString(); state.session.status = "closed"; state.session.active = false; state.session.endedAt = now; state.session.events.push({ type: "clock_out", occurredAt: now, source: "web" }); state.history.unshift(state.session); body = { session: state.session };
    } else if (/\/time-tracking\/team\/schedules\/[^/]+$/.test(path) && method === "PUT") {
      const userId = decodeURIComponent(path.split("/").pop() || "");
      const payload = route.request().postDataJSON();
      state.schedules = state.schedules.filter((item: any) => item.userId !== userId);
      state.schedules.push({ userId, timezone: payload.timezone, days: payload.days });
      body = { schedule: { userId, ...payload } };
    } else if (path.endsWith("/time-tracking/team/corrections/correction-e2e") && method === "PATCH") {
      const payload = route.request().postDataJSON();
      const item = state.teamCorrections.find((entry: any) => entry.id === "correction-e2e");
      if (item) item.status = payload.decision;
      body = { success: true, status: payload.decision };
    }

    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

function fixture(role: "member" | "owner"): Fixture {
  const isOwner = role === "owner";
  return {
    accessToken: "time-tracking-e2e-token",
    tenantId: "tenant-time-tracking-e2e",
    user: { id: "time-user", email: isOwner ? "owner@example.test" : "member@example.test", roles: isOwner ? ["admin"] : [], tenantId: "tenant-time-tracking-e2e" }
  };
}

test("member can clock in, start/end a break and clock out without a remote iframe", async ({ page }) => {
  const auth = fixture("member");
  const state = { session: null as any, history: [] as any[], myCorrections: [], mySchedule: null, members: [], schedules: [], teamCorrections: [] as any[] };
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.stack || error.message));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  await authenticate(page, auth);
  await installApiMocks(page, auth, state);
  await page.goto("/dashboard");
  await expect(page.locator(".bee-dash-company-switcher select")).toHaveValue(auth.tenantId, { timeout: 15000 });
  await page.getByRole("button", { name: /Control Horario/ }).click();
  await page.getByRole("button", { name: "Mi jornada" }).click();

  try {
    await expect(page.getByRole("heading", { name: "Mi jornada" })).toBeVisible({ timeout: 15000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    await page.screenshot({ path: "test-results/template-screenshots/time-tracking-member-debug.png", fullPage: true });
    throw new Error(String(error) + "\\nURL: " + page.url() + "\\nBODY: " + body + "\\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await expect(page.getByRole("button", { name: "Fichar entrada" })).toBeVisible();
  await expect(page.locator('iframe[title="time-tracking plugin"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Fichar entrada" }).click();
  await expect(page.getByText("Trabajando")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar pausa" })).toBeVisible();

  await page.getByRole("button", { name: "Iniciar pausa" }).click();
  await expect(page.getByText("En pausa")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar pausa" })).toBeVisible();

  await page.getByRole("button", { name: "Finalizar pausa" }).click();
  await expect(page.getByText("Trabajando")).toBeVisible();

  await page.getByRole("button", { name: "Fichar salida" }).click();
  await expect(page.getByRole("button", { name: "Fichar entrada" })).toBeVisible();
  await expect.poll(() => state.history[0]?.events?.map((event: any) => event.type)).toEqual(["clock_in", "break_start", "break_end", "clock_out"]);
  await page.getByRole("button", { name: "Actividad" }).click();
  await expect(page.getByText("Actividad reciente")).toBeVisible();
});

test("owner can save a weekly schedule and approve a team correction", async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(8000);
  const auth = fixture("owner");
  const state = {
    session: null,
    history: [],
    myCorrections: [],
    mySchedule: null,
    members: [{ userId: "masked-member-e2e", email: "member@example.test", role: "member" }],
    schedules: [],
    teamCorrections: [{
      id: "correction-e2e", sessionId: "session-old", userEmail: "member@example.test", eventType: "clock_in",
      originalAt: "2026-11-25T09:00:00.000Z", requestedAt: "2026-11-25T08:55:00.000Z",
      reason: "Forgot to register", status: "pending", createdAt: "2026-11-25T10:00:00.000Z"
    }]
  };
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.stack || error.message));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  await authenticate(page, auth);
  await installApiMocks(page, auth, state);
  await page.goto("/dashboard");
  await expect(page.locator(".bee-dash-company-switcher select")).toHaveValue(auth.tenantId, { timeout: 15000 });
  await page.getByRole("button", { name: /Control Horario/ }).click();
  const scheduleNav = page.getByRole("button", { name: /^(Horarios|Schedules|Mi horario|My schedule)$/ });
  try {
    await expect(scheduleNav).toBeVisible({ timeout: 5000 });
  } catch (error) {
    throw new Error(String(error) + "\\nOWNER NAVIGATION: " + await page.locator("body").innerText() + "\\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await scheduleNav.click();

  try {
    await expect(page.getByRole("heading", { name: "Planificación de horarios" })).toBeVisible({ timeout: 15000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    await page.screenshot({ path: "test-results/template-screenshots/time-tracking-owner-debug.png", fullPage: true });
    throw new Error(String(error) + "\\nURL: " + page.url() + "\\nBODY: " + body + "\\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await page.locator(".tt-content select").selectOption("masked-member-e2e", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "Guardar horario" })).toBeEnabled();
  await page.getByRole("checkbox", { name: "Activar lunes" }).check();
  const mondayRow = page.locator(".tt-table tbody tr").filter({ hasText: "Lunes" });
  await mondayRow.locator('input[type="time"]').nth(0).fill("08:30");
  await mondayRow.locator('input[type="time"]').nth(1).fill("16:30");
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await expect(page.getByRole("status")).toContainText("Horario guardado.");
  expect(state.schedules[0].timezone).toBe("Europe/Madrid");
  expect(state.schedules[0].days).toEqual([{ day: 1, start: "08:30", end: "16:30", breakMinutes: 0 }]);

  await page.getByRole("button", { name: "Incidencias" }).click();
  await expect(page.getByRole("heading", { name: "Incidencias" })).toBeVisible();
  await page.getByRole("button", { name: /Solicitudes del equipo/ }).click();
  await expect(page.getByText("member@example.test · Entrada")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("status")).toContainText("Corrección aprobada y aplicada.");
  expect(state.teamCorrections[0].status).toBe("approved");
});
