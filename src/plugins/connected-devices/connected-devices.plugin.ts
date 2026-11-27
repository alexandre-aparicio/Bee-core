import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";
import type { PluginAccessService } from "../../core/plugin-services.js";
import { ConnectedDevicesRepository } from "./connected-devices.repository.js";
import { createConnectedDevicesServices } from "./connected-devices.service.js";
import { registerConnectedDevicesRoutes } from "./connected-devices.routes.js";
import { migrateLegacyConnectedDevicesPlanAssignments } from "./connected-devices-plan-migration.js";
import { ConnectedDeviceCapabilities } from "./capability-registry.js";
export const connectedDevicesPlugin:BeePlugin={
 manifest:{ requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],name:"connected-devices",version:"0.2.0",description:"Tenant-scoped device pairing, identity, capability grants and revocation",dependencies:["auth","organizations"],scope:"tenant",activationPolicy:"manual"},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??"");
  if(secret.length<32)throw new Error("Connected Devices requires the session resource ID secret.");
  const access=ctx.services?.get<PluginAccessService>("core.plugin-access");
  if(!access)throw new Error("Connected Devices requires the Core plugin access contract.");
  const repository=new ConnectedDevicesRepository(db);await repository.initializeIndexes();
  const capabilities=new ConnectedDeviceCapabilities();
  ctx.services?.register("connected-devices.capabilities",capabilities);
  const services=createConnectedDevicesServices({secret,repository,access,capabilities});
  ctx.services?.register("connected-devices.device-auth",{authenticateDevice:services.authenticateDevice});
  registerConnectedDevicesRoutes(ctx,services);
  ctx.logger.info("Connected Devices plugin initialized: secure pairing, tenant device registry and extensible capability contract ready.");
 },
 async afterRuntimeLoaded(ctx){
  await migrateLegacyConnectedDevicesPlanAssignments(ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core")));
 }
};
