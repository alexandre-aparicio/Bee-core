export interface BeeEnvironmentConfig {
  environment: string;
  jwtSecret: string;
  mongoUri: string;
  mongoDbName: string;
  authMfaEncryptionKey: string;
}

const isExampleValue = (value: string): boolean =>
  /(?:replace[_ -]?with|change[_ -]?me|changeme|example|placeholder|your[_ -]|password123|secret123|^(?:password|admin|secret|test)$/i.test(value);

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): BeeEnvironmentConfig {
  const errors: string[] = [];
  const environment = String(env.NODE_ENV ?? "development").trim().toLowerCase();
  const jwtSecret = String(env.JWT_SECRET ?? "").trim();
  const authMfaEncryptionKey = String(env.AUTH_MFA_ENCRYPTION_KEY ?? "").trim();
  const mongoUri = String(env.MONGODB_URI ?? "").trim();
  const mongoDbName = String(env.MONGODB_DB ?? "bee_core").trim() || "bee_core";

  if (jwtSecret.length < 32) errors.push("JWT_SECRET must contain at least 32 characters.");
  const mfaKey = Buffer.from(authMfaEncryptionKey, "base64");
  if (mfaKey.length !== 32 || mfaKey.toString("base64") !== authMfaEncryptionKey) {
    errors.push("AUTH_MFA_ENCRYPTION_KEY must be a canonical base64 value encoding exactly 32 bytes (generate with: openssl rand -base64 32).");
  }

  let mongoUsername = "";
  let mongoPassword = "";
  if (!mongoUri) {
    errors.push("MONGODB_URI is required.");
  } else {
    try {
      const parsed = new URL(mongoUri);
      if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
        errors.push("MONGODB_URI must use mongodb:// or mongodb+srv://.");
      }
      mongoUsername = decodeURIComponent(parsed.username);
      mongoPassword = decodeURIComponent(parsed.password);
      if (!mongoUsername || !mongoPassword) errors.push("MONGODB_URI must include a non-empty MongoDB username and password.");
    } catch {
      errors.push("MONGODB_URI must be a valid MongoDB connection URI.");
    }
  }

  if (environment === "production") {
    for (const [name, value] of [
      ["JWT_SECRET", jwtSecret],
      ["AUTH_MFA_ENCRYPTION_KEY", authMfaEncryptionKey],
      ["MONGODB_URI", mongoUri],
      ["MongoDB username", mongoUsername],
      ["MongoDB password", mongoPassword],
      ["MONGO_ROOT_USERNAME", String(env.MONGO_ROOT_USERNAME ?? "").trim()],
      ["MONGO_ROOT_PASSWORD", String(env.MONGO_ROOT_PASSWORD ?? "").trim()],
      ["MONGO_APP_USERNAME", String(env.MONGO_APP_USERNAME ?? "").trim()],
      ["MONGO_APP_PASSWORD", String(env.MONGO_APP_PASSWORD ?? "").trim()],
      ["AUTH_ADMIN_PASSWORD", String(env.AUTH_ADMIN_PASSWORD ?? "").trim()]
    ] as const) {
      if (value && isExampleValue(value)) errors.push(`${name} contains an example or placeholder value; replace it before production startup.`);
    }
  }

  if (errors.length) throw new Error(`Invalid Bee-Core environment configuration:\n- ${errors.join("\n- ")}`);
  return { environment, jwtSecret, mongoUri, mongoDbName, authMfaEncryptionKey };
}
