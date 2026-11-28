import type { Collection, Db, Document } from "mongodb";
import { ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";

export type ConnectedDeviceStatus = "pending" | "active" | "suspended" | "revoked" | "expired" | "unlinked";
export type ConnectedDeviceRecord = Document & {
  id:string; tenantId:string; ownerUserId:string; requestedBy:string; pairingChallengeId?:string; name:string;
  deviceType:string; platform:string; appVersion:string|null;
  requestedCapabilities:string[]; grantedCapabilities:string[]; credentialHash:string;
  status:ConnectedDeviceStatus; pairingExpiresAt:Date; createdAt:Date; updatedAt:Date;
  approvedAt:Date|null; approvedBy:string|null; revokedAt:Date|null; revokedBy:string|null; lastSeenAt:Date|null;
};
export type PairingChallengeRecord = Document & {
  id:string; tenantId:string; userId:string; tokenHash:string; requestedCapabilities:string[];
  status:"issued"|"claimed"|"cancelled"; expiresAt:Date; createdAt:Date; claimedAt:Date|null; deviceId:string|null;
};
export class ConnectedDevicesRepository {
  readonly db: Db;
  readonly devices:Collection<ConnectedDeviceRecord>;
  readonly challenges:Collection<PairingChallengeRecord>;
  constructor(db:Db){
    this.db=db;
    this.devices=db.collection<ConnectedDeviceRecord>("connected_devices");
    this.challenges=db.collection<PairingChallengeRecord>("connected_device_pairing_challenges");
  }
  async initializeIndexes():Promise<void>{
    await ensureTenantAuditIndexes(this.db.collection<TenantAuditEvent>("tenant_audit_events"));
    await Promise.all([
      this.devices.createIndex({tenantId:1,id:1},{unique:true,name:"connected_devices_tenant_id_unique"}),
      this.devices.createIndex({tenantId:1,ownerUserId:1,status:1,createdAt:-1},{name:"connected_devices_owner_status"}),
      this.devices.createIndex({credentialHash:1},{unique:true,name:"connected_devices_credential_hash_unique"}),
      this.challenges.createIndex({id:1},{unique:true,name:"connected_device_pairing_id_unique"}),
      this.challenges.createIndex({tokenHash:1},{unique:true,name:"connected_device_pairing_token_unique"}),
      this.challenges.createIndex({expiresAt:1},{expireAfterSeconds:0,name:"connected_device_pairing_expiry"}),
      this.challenges.createIndex({tenantId:1,userId:1,createdAt:-1},{name:"connected_device_pairing_owner"})
    ]);
  }
}
