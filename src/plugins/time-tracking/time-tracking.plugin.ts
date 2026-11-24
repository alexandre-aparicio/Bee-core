import type { BeePlugin } from "../../core/types.js";
import { TimeTrackingRepository } from "./time-tracking.repository.js";
import { registerTimeTrackingRoutes } from "./time-tracking.controller.js";

export const timeTrackingPlugin:BeePlugin={
 manifest:{name:"time-tracking",version:"0.2.0",description:"Employee time clock, breaks and work-session history",dependencies:["auth","organizations","marketplace"],frontend:{routes:[{path:"/dashboard/time-tracking",component:"bee-time-tracking"}]}},
 async initialize(ctx){
  const db=ctx.mongoClient.db(String(ctx.config.mongoDbName??"bee_core"));
  const repository=new TimeTrackingRepository(db);
  await repository.initializeIndexes();
  await registerTimeTrackingRoutes(ctx,repository);
  ctx.logger.info("Time Tracking initialized: clock, weekly schedules and correction review.");
 }
};
