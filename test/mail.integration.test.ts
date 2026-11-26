import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import { authPlugin } from "../src/plugins/auth/auth.plugin.js";
import { mailPlugin } from "../src/plugins/mail/mail.plugin.js";
import { BeeEventBus } from "../src/core/event-bus.js";
import type { BeeContext, BeeLogger } from "../src/core/types.js";

const uri = process.env.MONGODB_TEST_URI;
const secret = "bee-mail-integration-test-secret-at-least-32-characters";
const encryptionKey = "bee-mail-encryption-test-key-at-least-32-characters";

test("tenant mailboxes keep credentials private and enforce tenant and role boundaries", { skip: !uri }, async () => {
  const previousEncryptionKey = process.env.BEE_MAIL_ENCRYPTION_KEY;
  process.env.BEE_MAIL_ENCRYPTION_KEY = encryptionKey;
  const dbName = "bee_mail_test_" + Date.now();
  const client = new MongoClient(uri!);
  await client.connect();
  const db = client.db(dbName);
  const passwordHash = await bcrypt.hash("Test-password-12345", 10);
  const now = new Date();

  await db.collection("tenants").insertMany([
    { id: "mail-alpha", name: "Mail Alpha", createdAt: now, status: "active" },
    { id: "mail-beta", name: "Mail Beta", createdAt: now, status: "active" }
  ]);
  await db.collection("users").insertMany([
    { id: "mail-owner-alpha", email: "owner@mail-alpha.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "mail-alpha", createdAt: now, updatedAt: now },
    { id: "mail-owner-beta", email: "owner@mail-beta.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "mail-beta", createdAt: now, updatedAt: now },
    { id: "mail-member-beta", email: "member@mail-beta.test", passwordHash, roles: ["user"], enabled: true, allowedClients: ["dashboard"], tenantId: "mail-beta", createdAt: now, updatedAt: now }
  ]);
  await db.collection("memberships").insertMany([
    { id: "mail-membership-alpha", userId: "mail-owner-alpha", tenantId: "mail-alpha", role: "owner", status: "active", createdAt: now, updatedAt: now },
    { id: "mail-membership-beta-owner", userId: "mail-owner-beta", tenantId: "mail-beta", role: "owner", status: "active", createdAt: now, updatedAt: now },
    { id: "mail-membership-beta-member", userId: "mail-member-beta", tenantId: "mail-beta", role: "member", status: "active", createdAt: now, updatedAt: now }
  ]);

  const app = Fastify();
  app.register(jwt, { secret });
  const logger: BeeLogger = { info() {}, warn() {}, error() {} };
  const ctx: BeeContext = {
    appName: "Bee mail integration test",
    version: "test",
    events: new BeeEventBus(),
    logger,
    server: app,
    mongoClient: client,
    config: {
      jwtSecret: secret,
      sessionIdSecret: secret,
      mongoUri: uri!,
      mongoDbName: dbName,
      authAdminEmail: "",
      authAdminPassword: ""
    }
  };

  try {
    await authPlugin.initialize?.(ctx);
    await mailPlugin.initialize?.(ctx);
    await app.ready();

    const login = async (email: string) => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "Test-password-12345", client: "dashboard" }
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json().accessToken as string;
    };

    const alphaToken = await login("owner@mail-alpha.test");
    const betaOwnerToken = await login("owner@mail-beta.test");
    const betaMemberToken = await login("member@mail-beta.test");
    const mailbox = {
      name: "Support",
      email: "support@mail-alpha.test",
      protocol: "imap",
      host: "imap.example.test",
      port: 993,
      secure: true,
      username: "support-user",
      password: "incoming-secret-value",
      smtpHost: "smtp.example.test",
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: "smtp-user",
      smtpPassword: "outgoing-secret-value"
    };

    const created = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken },
      payload: mailbox
    });
    assert.equal(created.statusCode, 201, created.body);
    const account = created.json().account;
    const accountId = account.id as string;
    const serializedAccount = JSON.stringify(account);
    assert.equal(serializedAccount.includes("incoming-secret-value"), false, "incoming password must never be returned");
    assert.equal(serializedAccount.includes("outgoing-secret-value"), false, "SMTP password must never be returned");
    assert.equal(serializedAccount.includes("passwordEncrypted"), false, "encrypted credentials must never be returned");
    assert.equal(serializedAccount.includes("smtpPasswordEncrypted"), false, "encrypted SMTP credentials must never be returned");

    const alphaList = await app.inject({
      method: "GET",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken }
    });
    assert.equal(alphaList.statusCode, 200);
    assert.equal(alphaList.json().accounts.length, 1);

    const betaList = await app.inject({
      method: "GET",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + betaOwnerToken }
    });
    assert.equal(betaList.statusCode, 200);
    assert.equal(betaList.json().accounts.length, 0, "another tenant must not discover the mailbox");

    const crossTenantUpdate = await app.inject({
      method: "PATCH",
      url: "/mail/accounts/" + accountId,
      headers: { authorization: "Bearer " + betaOwnerToken },
      payload: { name: "Hijacked mailbox" }
    });
    assert.equal(crossTenantUpdate.statusCode, 404, "another tenant must not update the mailbox");

    const memberCreate = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + betaMemberToken },
      payload: { ...mailbox, email: "member@mail-beta.test" }
    });
    assert.equal(memberCreate.statusCode, 403, "members must not configure mailboxes");

    const insecureIncoming = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken },
      payload: { ...mailbox, email: "insecure@mail-alpha.test", secure: false }
    });
    assert.equal(insecureIncoming.statusCode, 400, "incoming mail must reject plaintext transport");

    const insecureSmtp = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken },
      payload: { ...mailbox, email: "insecure-smtp@mail-alpha.test", smtpPort: 25, smtpSecure: false }
    });
    assert.equal(insecureSmtp.statusCode, 400, "SMTP must reject plaintext ports other than STARTTLS 587");

    const startTls = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken },
      payload: { ...mailbox, email: "starttls@mail-alpha.test", smtpPort: 587, smtpSecure: false }
    });
    assert.equal(startTls.statusCode, 201, "SMTP STARTTLS on port 587 remains supported");

    const duplicate = await app.inject({
      method: "POST",
      url: "/mail/accounts",
      headers: { authorization: "Bearer " + alphaToken },
      payload: mailbox
    });
    assert.equal(duplicate.statusCode, 409, "mailbox email must be unique within a tenant");

  } finally {
    await app.close();
    await mailPlugin.stop?.(ctx);
    await authPlugin.stop?.(ctx);
    await client.db(dbName).dropDatabase();
    await client.close();
    if (previousEncryptionKey === undefined) delete process.env.BEE_MAIL_ENCRYPTION_KEY;
    else process.env.BEE_MAIL_ENCRYPTION_KEY = previousEncryptionKey;
  }
});
