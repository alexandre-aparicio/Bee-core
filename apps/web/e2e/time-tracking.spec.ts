import { test, expect } from "./quality-gates";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Fixture = { accessToken: string; tenantId: string; user: { id: string; email: string; roles: string[]; tenantId: string } };

async function authenticate(page: Page, fixture: Fixture): Promise<void> {
  const serialized = JSON.stringify(fixture);
  await page.context().addCookies([{ name: "bee-test-auth", value: encodeURIComponent(serialized), url: "http://127.0.0.1:4200", sameSite: "Lax" }]);
  await page.addInitScript((value: string) => {
    if (window !== window.top) return;
    localStorage.setItem("bee-auth", value);
    localStorage.setItem("bee-template-selection", JSON.stringify({ public: "aurora", dashboard: "midnight" }));
  }, serialized);
}

function installApiMocks(page: Page, fixture: Fixture, state: any): Promise<void> {
  return page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    const assetPrefix = "/api/plugin-packages/time-tracking/0.2.2/assets/frontend/";
    if (path.startsWith(assetPrefix)) {
      const asset = path.slice(assetPrefix.length);
      const allowedAssets: Record<string, { file: string; contentType: string }> = {
        "index.html": { file: "index.html", contentType: "text/html; charset=utf-8" },
        "main.js": { file: "main.js", contentType: "text/javascript; charset=utf-8" },
        "styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" }
      };
      const entry = allowedAssets[asset];
      if (!entry) return route.fulfill({ status: 404, body: "Not found" });
      const bytes = await readFile(resolve(process.cwd(), "../../src/plugins/time-tracking/frontend", entry.file));
      return route.fulfill({
        status: 200,
        contentType: entry.contentType,
        headers: {
          "access-control-allow-origin": "*",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
        },
        body: bytes
      });
    }

    let status = 200;
    let body: any = {};
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
        id: "time-tracking", pluginKey: "time-tracking", name: "Control Horario",
        installed: true, enabled: true, entitled: true,
        frontendRoutes: [
          { path: "/dashboard/time-tracking/my_jorney", component: "time-tracking", id: "time-tracking-day", label: "My day", labelEs: "Mi jornada" },
          { path: "/dashboard/time-tracking/schedule", component: "time-tracking", id: "time-tracking-schedule", label: "My schedule", labelEs: "Mi horario", labelsByRole: { owner: { en: "Schedules", es: "Horarios" }, admin: { en: "Schedules", es: "Horarios" }, manager: { en: "Schedules", es: "Horarios" }, super_admin: { en: "Schedules", es: "Horarios" }, superadmin: { en: "Schedules", es: "Horarios" } } },
          { path: "/dashboard/time-tracking/history", component: "time-tracking", id: "time-tracking-history", label: "History", labelEs: "Historial", visibleRoles: ["member", "guest"] },
          { path: "/dashboard/time-tracking/requests", component: "time-tracking", id: "time-tracking-requests", label: "My requests", labelEs: "Mis solicitudes", labelsByRole: { owner: { en: "Incidents", es: "Incidencias" }, admin: { en: "Incidents", es: "Incidencias" }, manager: { en: "Incidents", es: "Incidencias" }, super_admin: { en: "Incidents", es: "Incidencias" }, superadmin: { en: "Incidents", es: "Incidencias" } } }
        ]
      }] };
    } else if (path.endsWith("/marketplace/plugins/time-tracking/runtime")) {
      body = { pluginId: "time-tracking", version: "0.2.2", entrypoint: "frontend/index.html", apiPrefixes: ["/time-tracking"], routes: [] };
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
    } else if (path.endsWith("/time-tracking/me/corrections") && method === "POST") {
      const payload = route.request().postDataJSON();
      const correction = { id: "correction-request-e2e", ...payload, status: "pending", createdAt: new Date().toISOString() };
      state.myCorrections.unshift(correction);
      status = 201;
      body = { correction };
    } else if (path.endsWith("/time-tracking/me/corrections") && method === "GET") {
      body = { corrections: state.myCorrections };
    } else if (path.endsWith("/time-tracking/me/schedule")) {
      body = { schedule: state.mySchedule };
    } else if (path.endsWith("/time-tracking/team/members")) {
      body = { members: state.members };
    } else if (path.endsWith("/time-tracking/team/schedules")) {
      body = { schedules: state.schedules };
    } else if (path.endsWith("/time-tracking/team/corrections") && method === "GET") {
      body = { corrections: state.teamCorrections.filter((item: any) => item.status === "pending") };
    } else if (path.endsWith("/time-tracking/clock-in") && method === "POST") {
      const now = new Date().toISOString();
      state.session = { id: "session-e2e", status: "working", active: true, startedAt: now, endedAt: null, events: [{ type: "clock_in", occurredAt: now, source: "web" }] };
      status = 201;
      body = { session: state.session };
    } else if (path.endsWith("/time-tracking/break-start") && method === "POST") {
      const now = new Date().toISOString();
      state.session.status = "on_break";
      state.session.events.push({ type: "break_start", occurredAt: now, source: "web" });
      body = { session: state.session };
    } else if (path.endsWith("/time-tracking/break-end") && method === "POST") {
      const now = new Date().toISOString();
      state.session.status = "working";
      state.session.events.push({ type: "break_end", occurredAt: now, source: "web" });
      body = { session: state.session };
    } else if (path.endsWith("/time-tracking/clock-out") && method === "POST") {
      const now = new Date().toISOString();
      state.session.status = "closed";
      state.session.active = false;
      state.session.endedAt = now;
      state.session.events.push({ type: "clock_out", occurredAt: now, source: "web" });
      state.history.unshift(state.session);
      body = { session: state.session };
    } else if (path.includes("/time-tracking/team/schedules/") && method === "PUT") {
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

test("member uses the signed ZIP iframe to clock in, manage breaks, view history and request a correction", async ({ page }) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(8000);
  const auth = fixture("member");
  const state = { session: null as any, history: [] as any[], myCorrections: [] as any[], mySchedule: null, members: [], schedules: [], teamCorrections: [] as any[] };
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.stack || error.message));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  await authenticate(page, auth);
  await installApiMocks(page, auth, state);
  await page.goto("/dashboard");
  await expect(page.locator(".bee-dash-company-switcher select")).toHaveValue(auth.tenantId, { timeout: 15000 });
  await page.getByRole("button", { name: /Control Horario/ }).click();
  await page.getByRole("button", { name: "Mi jornada" }).click();

  const plugin = page.frameLocator('iframe[title="time-tracking plugin"]');
  try {
    await expect(plugin.getByRole("heading", { name: "Control Horario" })).toBeVisible({ timeout: 15000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    await page.screenshot({ path: "test-results/template-screenshots/time-tracking-member-debug.png", fullPage: true });
    throw new Error(String(error) + "\nURL: " + page.url() + "\nBODY: " + body + "\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await expect(page.locator('iframe[title="time-tracking plugin"]')).toHaveCount(1);
  await expect(plugin.getByRole("button", { name: "Fichar entrada" })).toBeVisible();

  await plugin.getByRole("button", { name: "Fichar entrada" }).click();
  await expect(plugin.getByRole("heading", { name: "Trabajando" })).toBeVisible();
  await expect(plugin.getByRole("button", { name: "Iniciar pausa" })).toBeVisible();

  await plugin.getByRole("button", { name: "Iniciar pausa" }).click();
  await expect(plugin.getByRole("heading", { name: "En pausa" })).toBeVisible();
  await expect(plugin.getByRole("button", { name: "Finalizar pausa" })).toBeVisible();

  await plugin.getByRole("button", { name: "Finalizar pausa" }).click();
  await expect(plugin.getByRole("heading", { name: "Trabajando" })).toBeVisible();

  await plugin.getByRole("button", { name: "Fichar salida" }).click();
  await expect(plugin.getByRole("button", { name: "Fichar entrada" })).toBeVisible();
  await expect.poll(() => state.history[0]?.events?.map((event: any) => event.type)).toEqual(["clock_in", "break_start", "break_end", "clock_out"]);

  await plugin.getByRole("button", { name: "Actividad" }).click();
  await expect(plugin.getByRole("heading", { name: "Actividad reciente" })).toBeVisible();
  await plugin.getByRole("button", { name: "Corregir entrada" }).click();
  const correctionDialog = plugin.getByRole("dialog");
  await correctionDialog.locator("#reason").fill("Olvidé registrar la entrada");
  await correctionDialog.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(plugin.getByRole("status")).toContainText("Solicitud de corrección enviada.");
  expect(state.myCorrections[0]?.originalAt).toBeTruthy();

  await page.getByRole("button", { name: "Historial" }).click();
  await expect(plugin.getByRole("heading", { name: "Historial" })).toBeVisible();
  await page.getByRole("button", { name: "Mis solicitudes" }).click();
  await expect(plugin.getByText("Olvidé registrar la entrada")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("owner can manage schedules and review team corrections from the signed ZIP iframe", async ({ page }) => {
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
  const plugin = page.frameLocator('iframe[title="time-tracking plugin"]');
  try {
    await expect(scheduleNav).toBeVisible({ timeout: 5000 });
  } catch (error) {
    throw new Error(String(error) + "\nOWNER NAVIGATION: " + await page.locator("body").innerText() + "\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await scheduleNav.click();

  try {
    await expect(plugin.getByRole("heading", { name: "Planificación de horarios" })).toBeVisible({ timeout: 15000 });
  } catch (error) {
    const body = await page.locator("body").innerText();
    await page.screenshot({ path: "test-results/template-screenshots/time-tracking-owner-debug.png", fullPage: true });
    throw new Error(String(error) + "\nURL: " + page.url() + "\nBODY: " + body + "\nBROWSER ERRORS: " + browserErrors.join(" | "));
  }
  await plugin.locator("#member").selectOption("masked-member-e2e", { timeout: 5000 });
  await expect(plugin.getByRole("button", { name: "Guardar horario" })).toBeEnabled();
  await plugin.locator('input[type="checkbox"][data-day="1"]').check();
  const mondayRow = plugin.locator("#content table tbody tr").filter({ hasText: "Lunes" });
  await mondayRow.locator('input[type="time"]').nth(0).fill("08:30");
  await mondayRow.locator('input[type="time"]').nth(1).fill("16:30");
  await plugin.getByRole("button", { name: "Guardar horario" }).click();
  await expect(plugin.getByRole("status")).toContainText("Horario guardado.");
  expect(state.schedules[0].timezone).toBe("Europe/Madrid");
  expect(state.schedules[0].days).toEqual([{ day: 1, start: "08:30", end: "16:30", breakMinutes: 0 }]);

  await page.getByRole("button", { name: "Incidencias" }).click();
  await plugin.getByRole("button", { name: /Solicitudes del equipo/ }).click();
  await expect(plugin.getByText("member@example.test · Entrada")).toBeVisible();
  await plugin.getByRole("button", { name: "Aprobar" }).click();
  await expect(plugin.getByRole("status")).toContainText("Corrección aprobada y aplicada.");
  expect(state.teamCorrections[0].status).toBe("approved");
  expect(browserErrors).toEqual([]);
});
