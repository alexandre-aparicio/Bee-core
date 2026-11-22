import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { notificationsPlugin } from "../src/plugins/notifications/notifications.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;
const jwtSecret = "01234567890123456789012345678901";

test("notifications API enforces tenant isolation and read lifecycle", { skip: !uri }, async () => {
  const dbName = "bee_notifications_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  const now = new Date();

  await db.collection("tenants").insertMany([
    { id: "notify-alpha", name: "Notify Alpha", status: "active", createdAt: now },
    { id: "notify-beta", name: "Notify Beta", status: "active", createdAt: now }
  ]);
  await db.collection("users").insertMany([
    { id: "notify-user-alpha", email: "alpha@notify.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "notify-alpha", createdAt: now, updatedAt: now },
    { id: "notify-user-beta", email: "beta@notify.test", passwordHash, roles: ["admin"], enabled: true, allowedClients: ["dashboard"], tenantId: "notify-beta", createdAt: now, updatedAt: now }
  ]);

  const app = Fastify();
  const events = new BeeEventBus();
  const logger: BeeLogger = { info(){}, warn(){}, error(){} };
  const ctx: BeeContext = {
    appName: "Bee notifications test",
    version: "test",
    events,
    logger,
    server: app,
    mongoClient: client,
    config: { jwtSecret, sessionIdSecret: jwtSecret, mongoUri: uri!, mongoDbName: dbName }
  };

  try {
    app.register(jwt, { secret: jwtSecret });
    app.register(websocket);
    await authPlugin.initialize?.(ctx);
    await notificationsPlugin.initialize?.(ctx);
    await app.ready();

    const unauthenticated = await app.inject({ method: "GET", url: "/notifications" });
    assert.equal(unauthenticated.statusCode, 401, "notifications must require a valid dashboard session");

    const login = async (email: string): Promise<string> => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test-password-12345", client: "dashboard" }
      });
      assert.equal(response.statusCode, 200);
      return response.json().accessToken as string;
    };
    const alphaToken = await login("alpha@notify.test");
    const betaToken = await login("beta@notify.test");
    const alphaHeaders = { authorization: "Bearer " + alphaToken };
    const betaHeaders = { authorization: "Bearer " + betaToken };

    const alphaInitial = await app.inject({ method: "GET", url: "/notifications", headers: alphaHeaders });
    const betaInitial = await app.inject({ method: "GET", url: "/notifications", headers: betaHeaders });
    assert.equal(alphaInitial.statusCode, 200);
    assert.equal(betaInitial.statusCode, 200);
    assert.equal(alphaInitial.json().notifications.length, 1, "login should create one notification for Alpha");
    assert.equal(betaInitial.json().notifications.length, 1, "login should create one notification for Beta");
    assert.equal(alphaInitial.json().notifications[0].tenantId, "notify-alpha");
    assert.equal(betaInitial.json().notifications[0].tenantId, "notify-beta");

    await events.emit("notification.request", {
      userId: "notify-user-alpha",
      tenantId: "notify-alpha",
      title: "Workspace updated",
      message: "The workspace settings were updated.",
      category: "system",
      priority: "normal",
      action: { label: "Open settings", route: "/dashboard/settings" }
    });
    await events.emit("notification.request", {
      userId: "notify-user-alpha",
      tenantId: "notify-alpha",
      title: "Unsafe action",
      message: "An external redirect must be discarded.",
      action: { label: "Open external", route: "//evil.example" }
    });

    const alphaList = await app.inject({ method: "GET", url: "/notifications?limit=100", headers: alphaHeaders });
    const betaList = await app.inject({ method: "GET", url: "/notifications?limit=100", headers: betaHeaders });
    assert.equal(alphaList.json().notifications.length, 3);
    assert.equal(betaList.json().notifications.length, 1, "Alpha notifications must never appear in Beta");
    const safeAction = alphaList.json().notifications.find((item: { title: string }) => item.title === "Workspace updated");
    const unsafeAction = alphaList.json().notifications.find((item: { title: string }) => item.title === "Unsafe action");
    assert.equal(safeAction.action.route, "/dashboard/settings");
    assert.equal(unsafeAction.action, undefined, "protocol-relative external routes must be discarded");

    const alphaUnread = await app.inject({ method: "GET", url: "/notifications/unread-count", headers: alphaHeaders });
    assert.equal(alphaUnread.json().count, 3);
    const notificationId = safeAction.id as string;
    const markRead = await app.inject({ method: "PATCH", url: "/notifications/" + encodeURIComponent(notificationId) + "/read", headers: alphaHeaders });
    assert.equal(markRead.statusCode, 200);
    assert.equal(markRead.json().modified, 1);
    const repeatRead = await app.inject({ method: "PATCH", url: "/notifications/" + encodeURIComponent(notificationId) + "/read", headers: alphaHeaders });
    assert.equal(repeatRead.json().modified, 0, "marking a notification read twice must be idempotent");

    const crossTenantRead = await app.inject({ method: "PATCH", url: "/notifications/" + encodeURIComponent(notificationId) + "/read", headers: betaHeaders });
    assert.equal(crossTenantRead.json().modified, 0, "a different tenant user must not mutate the notification");
    const betaUnread = await app.inject({ method: "GET", url: "/notifications/unread-count", headers: betaHeaders });
    assert.equal(betaUnread.json().count, 1);

    const markAll = await app.inject({ method: "PATCH", url: "/notifications/read-all", headers: alphaHeaders });
    assert.equal(markAll.statusCode, 200);
    const afterMarkAll = await app.inject({ method: "GET", url: "/notifications/unread-count", headers: alphaHeaders });
    assert.equal(afterMarkAll.json().count, 0);

    const ticket = await app.inject({ method: "POST", url: "/notifications/realtime-ticket", headers: alphaHeaders });
    assert.equal(ticket.statusCode, 200);
    assert.equal(typeof ticket.json().ticket, "string");
    assert.equal(ticket.json().expiresIn, 30);
  } finally {
    await app.close();
    await db.dropDatabase();
    await client.close();
  }
});
