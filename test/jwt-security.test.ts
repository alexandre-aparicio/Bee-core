import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

const secret = "bee-core-jwt-security-test-secret-2026";
const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

const signedToken = (payload: unknown, algorithm = "HS256") => {
  const header = b64url({ alg: algorithm, typ: "JWT" });
  const body = b64url(payload);
  const digest = algorithm === "HS384" ? "sha384" : "sha256";
  const signature = createHmac(digest, secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
};

test("JWT verification enforces algorithm, issuer, audience and required expiration", async (t) => {
  const app = Fastify();
  app.register(jwt, {
    secret,
    sign: {
      algorithm: "HS256",
      expiresIn: "20m",
      iss: "bee-core",
      aud: "bee-core",
    },
    verify: {
      algorithms: ["HS256"],
      allowedAud: "bee-core",
      allowedIss: "bee-core",
      requiredClaims: ["exp", "aud", "iss"],
    },
  });

  await app.ready();
  try {
    const validPayload = {
      sub: "security-test-user",
      iss: "bee-core",
      aud: "bee-core",
      exp: Math.floor(Date.now() / 1000) + 60,
    };

    await t.test("accepts a correctly signed token with all required claims", () => {
      const token = app.jwt.sign({ sub: "security-test-user" });
      const claims = app.jwt.verify<{ sub: string; iss: string; aud: string; exp: number }>(token);
      assert.equal(claims.sub, "security-test-user");
      assert.equal(claims.iss, "bee-core");
      assert.equal(claims.aud, "bee-core");
      assert.ok(claims.exp > Math.floor(Date.now() / 1000));
    });

    await t.test("rejects an expired token", () => {
      const token = signedToken({ ...validPayload, exp: Math.floor(Date.now() / 1000) - 60 });
      assert.throws(() => app.jwt.verify(token));
    });

    await t.test("rejects a different signing algorithm", () => {
      const token = signedToken(validPayload, "HS384");
      assert.throws(() => app.jwt.verify(token));
    });

    await t.test("rejects an incorrect audience", () => {
      const token = signedToken({ ...validPayload, aud: "another-service" });
      assert.throws(() => app.jwt.verify(token));
    });

    await t.test("rejects an incorrect issuer", () => {
      const token = signedToken({ ...validPayload, iss: "untrusted-issuer" });
      assert.throws(() => app.jwt.verify(token));
    });

    await t.test("rejects a token with an altered signature", () => {
      const token = signedToken(validPayload);
      const [header, payload, signature] = token.split(".");
      const altered = signature.endsWith("A") ? "B" : "A";
      assert.throws(() => app.jwt.verify(`${header}.${payload}.${altered}`));
    });

    for (const [claim, payload] of [
      ["exp", { sub: "security-test-user", iss: "bee-core", aud: "bee-core" }],
      ["aud", { sub: "security-test-user", iss: "bee-core", exp: Math.floor(Date.now() / 1000) + 60 }],
      ["iss", { sub: "security-test-user", aud: "bee-core", exp: Math.floor(Date.now() / 1000) + 60 }],
    ] as const) {
      await t.test(`rejects a token missing required ${claim} claim`, () => {
        const token = signedToken(payload);
        assert.throws(() => app.jwt.verify(token));
      });
    }

    await t.test("rejects a signed array payload instead of a claims object", () => {
      const token = signedToken(["security-test-user", "platformRole:superadmin"]);
      assert.throws(() => app.jwt.verify(token));
    });
  } finally {
    await app.close();
  }
});
