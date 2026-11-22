import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnvironment } from "../src/core/environment.js";

const validEnvironment = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  JWT_SECRET: "test-jwt-secret-with-at-least-32-characters",
  AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  MONGODB_URI: "mongodb://bee_app:strong-mongo-password@127.0.0.1:27017/bee_core?authSource=admin",
  MONGODB_DB: "bee_core",
  ...overrides
});

test("accepts a valid environment and returns normalized runtime settings", () => {
  const config = validateEnvironment(validEnvironment());
  assert.equal(config.mongoDbName, "bee_core");
  assert.equal(config.mongoUri, "mongodb://bee_app:strong-mongo-password@127.0.0.1:27017/bee_core?authSource=admin");
  assert.equal(config.jwtSecret.length >= 32, true);
});

test("rejects missing and short JWT secrets", () => {
  assert.throws(() => validateEnvironment(validEnvironment({ JWT_SECRET: "" })), /JWT_SECRET must contain at least 32 characters/);
  assert.throws(() => validateEnvironment(validEnvironment({ JWT_SECRET: "short" })), /JWT_SECRET must contain at least 32 characters/);
});

test("rejects malformed MFA encryption keys", () => {
  assert.throws(() => validateEnvironment(validEnvironment({ AUTH_MFA_ENCRYPTION_KEY: "not-a-key" })), /AUTH_MFA_ENCRYPTION_KEY must be a canonical base64/);
  assert.throws(() => validateEnvironment(validEnvironment({ AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })), /exactly 32 bytes/);
});

test("requires a MongoDB URI with explicit username and password", () => {
  assert.throws(() => validateEnvironment(validEnvironment({ MONGODB_URI: "" })), /MONGODB_URI is required/);
  assert.throws(() => validateEnvironment(validEnvironment({ MONGODB_URI: "mongodb://127.0.0.1:27017/bee_core" })), /non-empty MongoDB username and password/);
  assert.throws(() => validateEnvironment(validEnvironment({ MONGODB_URI: "https://user:pass@example.test/db" })), /must use mongodb/);
});

test("rejects example credentials and secrets in production", () => {
  assert.throws(() => validateEnvironment(validEnvironment({
    NODE_ENV: "production",
    JWT_SECRET: "REPLACE_WITH_64_PLUS_RANDOM_HEX_CHARACTERS_1234567890",
    AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    MONGODB_URI: "mongodb://bee_core_app:REPLACE_WITH_HEX_64_CHARACTERS@mongodb:27017/bee_core?authSource=bee_core"
  })), /example or placeholder value/);
});

test("accepts production values that are not placeholders", () => {
  const config = validateEnvironment(validEnvironment({
    NODE_ENV: "production",
    JWT_SECRET: "a".repeat(64),
    AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("base64"),
    MONGODB_URI: "mongodb://bee_app:long-random-mongo-password-8X2p@mongodb:27017/bee_core?authSource=bee_core",
    AUTH_ADMIN_PASSWORD: "admin-password-with-random-suffix-83x"
  }));
  assert.equal(config.environment, "production");
});
