import type { BeePlugin } from "../../core/types.js";
import type { Db } from "mongodb";
import { ConnectedDevicesRepository } from "./connected-devices.repository.js";
import { createConnectedDevicesServices } from "./connected-devices.service.js";
import { registerConnectedDevicesRoutes } from "./connected-devices.routes.js";
export const connectedDevicesPlugin:BeePlugin={
 manifest:{ requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],name:"connected-devices",version:"0.1.1",description:"Tenant-scoped device pairing, identity, capability grants and revocation",dependencies:["auth","organizations"],scope:"tenant",activationPolicy:"manual",frontend:{routes:[{path:"/dashboard/connected-devices",component:"connected-devices"}]}},
 async initialize(ctx){
  const db:Db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const secret=String(ctx.config.sessionIdSecret??"");
  if(secret.length<32)throw new Error("Connected Devices requires the session resource ID secret.");
  const repository=new ConnectedDevicesRepository(db);await repository.initializeIndexes();
  const services=createConnectedDevicesServices({db,secret,repository});registerConnectedDevicesRoutes(ctx,services);
  ctx.logger.info("Connected Devices plugin initialized: secure pairing and tenant device registry ready.");
 }
};
