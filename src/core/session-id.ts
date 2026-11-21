import { createHmac, createCipheriv, createDecipheriv } from "node:crypto";

export type SessionResourceType = "tenant" | "plugin" | "user" | "membership" | "role" | "invitation" | "file" | "note" | "job" | "audit" | "installation" | "subscription";
export type SessionIdContext = { sessionId: string; expiresAt: Date };
type Payload = { v: 1; t: SessionResourceType; id: string; sid: string; exp: number };

const keyFor = (secret: string, sessionId: string): Buffer => {
  if (secret.length < 32) throw new Error("Session ID secret must contain at least 32 characters");
  if (!sessionId) throw new Error("A valid session is required");
  return createHmac("sha256", secret).update("bee-core:session-resource-id:v1:").update(sessionId).digest();
};

export function maskResourceId(id: string, type: SessionResourceType, session: SessionIdContext, secret: string): string {
  if (!id || !session?.sessionId || !(session.expiresAt instanceof Date) || !Number.isFinite(session.expiresAt.getTime()) || session.expiresAt.getTime() <= Date.now()) {
    throw new Error("Cannot mask an ID without an active session");
  }
  const payload: Payload = { v: 1, t: type, id, sid: session.sessionId, exp: session.expiresAt.getTime() };
  const key = keyFor(secret, session.sessionId);
  // Deterministic per (session, resource type, internal ID): stable for the
  // lifetime of a session without reusing a GCM nonce for different plaintexts.
  const nonce = createHmac("sha256", key).update("nonce:v1:").update(JSON.stringify(payload)).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function unmaskResourceId(reference: string, expectedType: SessionResourceType, session: SessionIdContext, secret: string): string {
  try {
    if (!reference || !session?.sessionId || !(session.expiresAt instanceof Date) || session.expiresAt.getTime() <= Date.now()) throw new Error();
    const packed = Buffer.from(reference, "base64url");
    if (packed.length < 30 || packed[0] !== 1) throw new Error();
    const nonce = packed.subarray(1, 13);
    const tag = packed.subarray(13, 29);
    const encrypted = packed.subarray(29);
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret, session.sessionId), nonce);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as Payload;
    if (payload.v !== 1 || payload.t !== expectedType || payload.sid !== session.sessionId || !payload.id ||
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


const RESOURCE_FIELDS: Record<string, SessionResourceType> = {
  tenantId: "tenant", companyId: "tenant", tenantIds: "tenant",
  pluginId: "plugin", pluginIds: "plugin",
  userId: "user", userIds: "user", actorId: "user", createdBy: "user", updatedBy: "user", ownerId: "user",
  membershipId: "membership", roleId: "role", customRoleId: "role",
  invitationId: "invitation", fileId: "file", noteId: "note", jobId: "job",
  auditEventId: "audit", installationId: "installation", subscriptionId: "subscription"
};

const RESOURCE_CONTAINERS: Record<string, SessionResourceType> = {
  tenant: "tenant", company: "tenant", companies: "tenant", tenants: "tenant",
  plugin: "plugin", plugins: "plugin",
  user: "user", users: "user", owner: "user", actor: "user",
  membership: "membership", memberships: "membership",
  role: "role", roles: "role",
  invitation: "invitation", invitations: "invitation",
  file: "file", files: "file",
  note: "note", notes: "note",
  job: "job", jobs: "job",
  event: "audit", events: "audit", installation: "installation", installations: "installation", subscription: "subscription", subscriptions: "subscription"
};

export function transformSessionResourceIds<T>(
  value: T,
  direction: "mask" | "unmask",
  session: SessionIdContext,
  secret: string
): T {
  const transform = (input: unknown, parentType?: SessionResourceType, siblings?: Record<string, unknown>): unknown => {
    if (Array.isArray(input)) return input.map(item => transform(item, parentType));
    if (!input || typeof input !== "object" || input instanceof Date || Buffer.isBuffer(input)) return input;
    const source = input as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      const fieldType = RESOURCE_FIELDS[key] ??
        (key === "resourceId" && typeof source.resourceType === "string" &&
          ["tenant", "plugin", "user", "membership", "role", "invitation", "file", "note", "job", "audit", "installation", "subscription"].includes(source.resourceType)
          ? source.resourceType as SessionResourceType : undefined);
      const childType = fieldType ?? (key === "id" ? parentType : RESOURCE_CONTAINERS[key]);
      if (typeof child === "string" && child.length && childType && (key === "id" || fieldType)) {
        result[key] = direction === "mask"
          ? maskResourceId(child, childType, session, secret)
          : unmaskResourceId(child, childType, session, secret);
      } else if (Array.isArray(child) && fieldType) {
        result[key] = child.map(item => typeof item === "string" && item.length
          ? (direction === "mask" ? maskResourceId(item, fieldType, session, secret) : unmaskResourceId(item, fieldType, session, secret))
          : transform(item, fieldType));
      } else {
        result[key] = transform(child, RESOURCE_CONTAINERS[key] ?? parentType, source);
      }
    }
    return result;
  };
  return transform(value) as T;
}
