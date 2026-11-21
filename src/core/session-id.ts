import { createHmac, createCipheriv, createDecipheriv } from "node:crypto";

export type SessionResourceType = "tenant" | "plugin" | "user" | "membership" | "role" | "invitation" | "file" | "note" | "job" | "audit-event";
export type SessionIdContext = { sessionId: string; expiresAt: Date };
const RESOURCE_TYPE_CODES: Record<SessionResourceType, number> = {
  tenant: 1, plugin: 2, user: 3, membership: 4, role: 5,
  invitation: 6, file: 7, note: 8, job: 9, "audit-event": 10
};
const CODE_RESOURCE_TYPES = new Map<number, SessionResourceType>(
  Object.entries(RESOURCE_TYPE_CODES).map(([type, code]) => [code, type as SessionResourceType])
);export function maskResourceId(id: string, type: SessionResourceType, session: SessionIdContext, secret: string): string {
  if (typeof id !== "string" || !id || Buffer.byteLength(id, "utf8") > MAX_ID_BYTES || !RESOURCE_TYPES.has(type) ||
      !session?.sessionId || !(session.expiresAt instanceof Date) || !Number.isSafeInteger(session.expiresAt.getTime()) || session.expiresAt.getTime() <= Date.now()) {
    throw new Error("Cannot mask an ID without a valid resource and active session");
  }
  const idBytes = Buffer.from(id, "utf8");
  // Compact binary payload: version, resource type, expiry (uint64 ms), then UTF-8 ID.
  // The session is bound through the derived encryption key, avoiding a repeated session UUID in every URL reference.
  const payload = Buffer.allocUnsafe(10 + idBytes.length);
  payload[0] = 1;
  payload[1] = RESOURCE_TYPE_CODES[type];
  payload.writeBigUInt64BE(BigInt(session.expiresAt.getTime()), 2);
  idBytes.copy(payload, 10);

  const key = keyFor(secret, session.sessionId);
  const nonce = createHmac("sha256", key).update("bee-core:session-resource-nonce:v2:").update(payload).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const reference = Buffer.concat([Buffer.from([2]), nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
  if (reference.length > MAX_REFERENCE_LENGTH) throw new Error("Resource ID is too large");
  return reference;
}

export function unmaskResourceId(reference: string, expectedType: SessionResourceType, session: SessionIdContext, secret: string): string {
  try {
    if (typeof reference !== "string" || !reference || reference.length > MAX_REFERENCE_LENGTH ||
        !/^[A-Za-z0-9_-]+$/.test(reference) || !session?.sessionId ||
        !(session.expiresAt instanceof Date) || !Number.isSafeInteger(session.expiresAt.getTime()) || session.expiresAt.getTime() <= Date.now() ||
        !RESOURCE_TYPES.has(expectedType)) throw new Error();
    const packed = Buffer.from(reference, "base64url");
    if (packed.toString("base64url") !== reference || packed.length < 40 || packed[0] !== 2) throw new Error();
    const nonce = packed.subarray(1, 13);
    const tag = packed.subarray(13, 29);
    const encrypted = packed.subarray(29);
    const key = keyFor(secret, session.sessionId);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    const payload = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (payload.length < 11 || payload[0] !== 1 || CODE_RESOURCE_TYPES.get(payload[1]) !== expectedType) throw new Error();
    const expiresAt = Number(payload.readBigUInt64BE(2));
    const idBytes = payload.subarray(10);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > session.expiresAt.getTime() ||
        idBytes.length === 0 || idBytes.length > MAX_ID_BYTES) throw new Error();
    const id = new TextDecoder("utf-8", { fatal: true }).decode(idBytes);
    if (!id) throw new Error();
    return id;
  } catch {
    throw new Error("Invalid, expired, or session-mismatched resource reference");
  }
}
