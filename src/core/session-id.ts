import { createHmac, createCipheriv, createDecipheriv } from "node:crypto";

export type SessionResourceType = "tenant" | "plugin" | "user" | "membership" | "role" | "invitation" | "file" | "note" | "job" | "audit-event";
export type SessionIdContext = { sessionId: string; expiresAt: Date };
type Payload = { v: 1; t: SessionResourceType; id: string; sid: string; exp: number };

const RESOURCE_TYPES = new Set<SessionResourceType>(["tenant", "plugin", "user", "membership", "role", "invitation", "file", "note", "job", "audit-event"]);
const MAX_ID_BYTES = 1024;
const MAX_REFERENCE_LENGTH = 2048;

const keyFor = (secret: string, sessionId: string): Buffer => {
  if (secret.length < 32) throw new Error("Session ID secret must contain at least 32 characters");
  if (!sessionId) throw new Error("A valid session is required");
  return createHmac("sha256", secret).update("bee-core:session-resource-id:v1:").update(sessionId).digest();
};

export function maskResourceId(id: string, type: SessionResourceType, session: SessionIdContext, secret: string): string {
  if (typeof id !== "string" || !id || Buffer.byteLength(id, "utf8") > MAX_ID_BYTES || !RESOURCE_TYPES.has(type) ||
      !session?.sessionId || !(session.expiresAt instanceof Date) || !Number.isFinite(session.expiresAt.getTime()) || session.expiresAt.getTime() <= Date.now()) {
    throw new Error("Cannot mask an ID without a valid resource and active session");
  }
  const payload: Payload = { v: 1, t: type, id, sid: session.sessionId, exp: session.expiresAt.getTime() };
  const serialized = JSON.stringify(payload);
  const key = keyFor(secret, session.sessionId);
  // Deterministic per (session, type, resource, expiry) so clients can compare
  // references across responses without exposing the underlying identifier.
  // The keyed PRF gives distinct nonces for distinct plaintexts; identical
  // plaintexts intentionally reuse the same nonce and ciphertext.
  const nonce = createHmac("sha256", key).update("bee-core:session-resource-nonce:v1:").update(serialized).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
  const reference = Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (reference.length > MAX_REFERENCE_LENGTH) throw new Error("Resource ID is too large");
  return reference;
}

export function unmaskResourceId(reference: string, expectedType: SessionResourceType, session: SessionIdContext, secret: string): string {
  try {
    if (typeof reference !== "string" || !reference || reference.length > MAX_REFERENCE_LENGTH ||
        !/^[A-Za-z0-9_-]+$/.test(reference) || !session?.sessionId ||
        !(session.expiresAt instanceof Date) || !Number.isFinite(session.expiresAt.getTime()) || session.expiresAt.getTime() <= Date.now() ||
        !RESOURCE_TYPES.has(expectedType)) throw new Error();
    const packed = Buffer.from(reference, "base64url");
    if (packed.toString("base64url") !== reference || packed.length < 30 || packed[0] !== 1) throw new Error();
    const nonce = packed.subarray(1, 13);
    const tag = packed.subarray(13, 29);
    const encrypted = packed.subarray(29);
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret, session.sessionId), nonce);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as Payload;
    if (payload.v !== 1 || payload.t !== expectedType || payload.sid !== session.sessionId ||
        typeof payload.id !== "string" || !payload.id || Buffer.byteLength(payload.id, "utf8") > MAX_ID_BYTES ||
        !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() || payload.exp > session.expiresAt.getTime()) throw new Error();
    return payload.id;
  } catch {
    throw new Error("Invalid, expired, or session-mismatched resource reference");
  }
}

export const maskTenantId = (id: string, session: SessionIdContext, secret: string) => maskResourceId(id, "tenant", session, secret);
export const unmaskTenantId = (id: string, session: SessionIdContext, secret: string) => unmaskResourceId(id, "tenant", session, secret);
export const maskPluginId = (id: string, session: SessionIdContext, secret: string) => maskResourceId(id, "plugin", session, secret);
export const unmaskPluginId = (id: string, session: SessionIdContext, secret: string) => unmaskResourceId(id, "plugin", session, secret);
export const maskUserId = (id: string, session: SessionIdContext, secret: string) => maskResourceId(id, "user", session, secret);
export const unmaskUserId = (id: string, session: SessionIdContext, secret: string) => unmaskResourceId(id, "user", session, secret);
