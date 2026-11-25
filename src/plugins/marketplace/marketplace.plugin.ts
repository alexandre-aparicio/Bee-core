import type { BeePlugin } from "../../core/types.js";
import type { Collection } from "mongodb";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { TenantCollection } from "../../core/tenant-collection.js";
import { rollbackTenantPluginMigrations, runTenantPluginMigrations } from "../../core/plugin-migrations.js";
import { claimPluginInstallJob, completePluginInstallJob, renewPluginInstallJobLease, enqueuePluginInstallJob, enqueuePluginUpdateJob, enqueuePluginUninstallJob, ensurePluginInstallJobIndexes, failPluginInstallJob, type PluginInstallJob } from "../../core/plugin-install-jobs.js";
import { resolveTenantContext, hasTenantPermission } from "../../core/tenant-context.js";
import { appendTenantAuditEvent, ensureTenantAuditIndexes, type TenantAuditEvent } from "../../core/audit-log.js";
import { tenantSlugFromHost } from "../../core/tenant-domain.js";
import { maskResourceId, unmaskResourceId } from "../../core/session-id.js";
import { ensurePlatformPluginRegistry, setPlatformPackageAvailable, setPlatformPackageInstalled } from "../../core/platform-plugin-registry.js";
import { getRuntimePlugin } from "../../core/runtime-plugin-registry.js";
import {
  getBuiltInPlan,
  getTenantPluginCatalog,
  getTenantSubscription,
  getTrustedPluginPackage,
  syncAutomaticPluginProvisioning,
  resolvePluginDependencyOrder,
  type PluginPackageDefinition,
  hasPluginEntitlement,
  isPluginEnabled,
  isPluginInstalled,
  isPlatformPluginEnabled,
  seedPluginCommerce
} from "../../core/plugin-entitlements.js";

let installWorkerTimer: ReturnType<typeof setInterval> | undefined;
let installWorkerTask: Promise<void> | undefined;

export const marketplacePlugin: BeePlugin = {
  manifest: {
    name: "marketplace",
    version: "0.2.0",
    description: "Central business plugin catalog with company plans and purchase entitlements",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    const db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const getMarketplacePackage = async (pluginId:string):Promise<PluginPackageDefinition|undefined> => {
      const builtIn=getTrustedPluginPackage(pluginId);
      if(builtIn)return builtIn;
      const runtime=getRuntimePlugin(pluginId);
      if(!runtime)return undefined;
      const metadata=await db.collection<PluginPackageDefinition>("plugin_catalog").findOne({id:pluginId,status:"published",codeAvailable:true});
      if(!metadata)return undefined;
      return {...metadata,migrations:runtime.tenantMigrations??[],installTenant:runtime.installTenant,updateTenant:runtime.updateTenant,uninstallTenant:runtime.uninstallTenant};
    };
    const selectTenantMigrations=(definition:PluginPackageDefinition,phase:"install"|"upgrade")=>(definition.migrations??[]).filter(migration=>!migration.phase||migration.phase===phase);
    const getDependencyOrder = async (pluginId:string):Promise<string[]> => {
      const definitions=await db.collection<PluginPackageDefinition>("plugin_catalog").find({status:"published",codeAvailable:true}).project<{id:string;dependencies:string[]}>({id:1,dependencies:1,_id:0}).toArray();
      return resolvePluginDependencyOrder(pluginId,definitions);
    };
    await ensurePlatformPluginRegistry(db);
    const sessionIdSecret=String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
    if(sessionIdSecret.length<32)throw new Error("Marketplace: JWT_SECRET must contain at least 32 characters.");
    const sessionOf=(tenant:import("../../core/tenant-context.js").TenantContext)=>({sessionId:tenant.sessionId,expiresAt:tenant.sessionExpiresAt});
    const mask=(tenant:import("../../core/tenant-context.js").TenantContext,id:string,type:import("../../core/session-id.js").SessionResourceType)=>maskResourceId(id,type,sessionOf(tenant),sessionIdSecret);
    const publicPlugin=(tenant:import("../../core/tenant-context.js").TenantContext,plugin:any)=>({...plugin,pluginKey:String(plugin.id),id:mask(tenant,String(plugin.id),"plugin"),externalRuntime:!getTrustedPluginPackage(String(plugin.id))&&Boolean(getRuntimePlugin(String(plugin.id)) ),...(Array.isArray(plugin.dependencies)?{dependencies:plugin.dependencies.map((id:string)=>mask(tenant,id,"plugin"))}:{})});
    const publicJob=(tenant:import("../../core/tenant-context.js").TenantContext,job:any)=>({id:mask(tenant,String(job.id),"job"),pluginId:mask(tenant,String(job.pluginId),"plugin"),action:job.action,status:job.status,attempts:job.attempts,maxAttempts:job.maxAttempts,createdAt:job.createdAt,updatedAt:job.updatedAt,startedAt:job.startedAt??null,finishedAt:job.finishedAt??null});
    const auditEvents:Collection<TenantAuditEvent>=db.collection("tenant_audit_events");
    const installJobs:Collection<PluginInstallJob>=db.collection<PluginInstallJob>("plugin_install_jobs");
    await ensurePluginInstallJobIndexes(installJobs);
    await ensureTenantAuditIndexes(auditEvents);
    const auditMarketplaceEvent=async(event:{tenantId:string;actorId:string;action:TenantAuditEvent["action"];outcome:TenantAuditEvent["outcome"];resourceType?:string;resourceId?:string;metadata?:TenantAuditEvent["metadata"]})=>{try{const record:import("../../core/audit-log.js").AuditEventInput={id:randomUUID(),occurredAt:new Date(),tenantId:event.tenantId,actorId:event.actorId,action:event.action,outcome:event.outcome,resourceType:event.resourceType,resourceId:event.resourceId,metadata:event.metadata};await appendTenantAuditEvent(auditEvents,record);}catch(error){ctx.logger.error("Marketplace audit event write failed",{action:event.action,tenantId:event.tenantId,error});}};
    await seedPluginCommerce(db);
    // The durable job lease is the source of truth for crash recovery; do not rewrite live installation state at startup.
    const billingWebhookSecret = String(ctx.config.billingWebhookSecret ?? "");
    ctx.server.post<{ Body: {
      event?: "plugin.purchase" | "plugin.revoke" | "subscription.updated";
      tenantId?: string;
      pluginId?: string;
      providerReference?: string;
      expiresAt?: string | null;
      planId?: string;
      status?: "trial" | "active" | "past_due" | "cancelled";
    } }>("/billing/webhooks/entitlement", async (request, reply) => {
      if (!billingWebhookSecret) return reply.code(503).send({ error: "Billing webhook is not configured" });
      const authorization = String(request.headers.authorization ?? "");
      const supplied = Buffer.from(authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
      const expected = Buffer.from(billingWebhookSecret);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return reply.code(401).send({ error: "Invalid billing webhook credentials" });
      }

      const body = request.body ?? {};
      const tenantId = String(body.tenantId ?? "");
      if (!tenantId || !await db.collection("tenants").findOne({ id: tenantId })) {
        return reply.code(400).send({ error: "A valid tenantId is required" });
      }

      if (body.event === "subscription.updated") {
        const plan = body.planId ? getBuiltInPlan(body.planId) : undefined;
        const status = body.status;
        if (!plan || !status || !["trial", "active", "past_due", "cancelled"].includes(status)) {
          return reply.code(400).send({ error: "Valid planId and subscription status are required" });
        }
        const periodEnd = body.expiresAt ? new Date(body.expiresAt) : null;
        if (periodEnd && Number.isNaN(periodEnd.getTime())) return reply.code(400).send({ error: "Invalid subscription expiry date" });
        const subscriptions = new TenantCollection<import("../../core/plugin-entitlements.js").TenantSubscription>(
          db.collection("tenant_subscriptions"),
          tenantId
        );
        const current = await getTenantSubscription(db, tenantId);
        const previousPeriodEnd = current.currentPeriodEnd ?? null;
        const currentPeriodEnd = previousPeriodEnd?.getTime() ?? null;
        const nextPeriodEnd = periodEnd?.getTime() ?? null;
        const changed = current.planId !== plan.id || current.status !== status || currentPeriodEnd !== nextPeriodEnd;
        if (changed) {
          const result = await subscriptions.updateOne(
            { id: current.id, planId: current.planId, status: current.status, currentPeriodEnd: previousPeriodEnd },
            { $set: { planId: plan.id, status, currentPeriodEnd: periodEnd, updatedAt: new Date() } }
          );
          if (!result.matchedCount) {
            const latest = await getTenantSubscription(db, tenantId);
            const latestPeriodEnd = latest.currentPeriodEnd?.getTime() ?? null;
            if (latest.planId === plan.id && latest.status === status && latestPeriodEnd === nextPeriodEnd) {
              return { success: true, event: body.event, changed: false };
            }
            return reply.code(409).send({ error: "Subscription changed concurrently; retry the event" });
          }
          await auditMarketplaceEvent({
            tenantId,
            actorId: "billing-webhook",
            action: "subscription.updated",
            outcome: "success",
            resourceType: "subscription",
            resourceId: tenantId,
            metadata: { planId: plan.id, status, currentPeriodEnd: periodEnd?.toISOString() ?? null }
          });
          await ctx.events.emit("subscription.updated", { tenantId, planId: plan.id, status });
          const automaticPackages=await db.collection("plugin_catalog").find({includedInPlans:plan.id,activationPolicy:"automatic",codeAvailable:true}).project<{id:string}>({id:1,_id:0}).toArray();
          for(const item of automaticPackages)await syncAutomaticPluginProvisioning(db,item.id);
          const assignedPackages=await db.collection("plugin_plan_package_assignments").find({planId:plan.id}).project<{pluginId:string}>({pluginId:1,_id:0}).toArray();
          for(const item of assignedPackages)await syncAutomaticPluginProvisioning(db,item.pluginId);
        }
        return { success: true, event: body.event, changed };
      }

      if (body.event === "plugin.purchase" || body.event === "plugin.revoke") {
        const pluginId = String(body.pluginId ?? "").trim();
        const providerReference = String(body.providerReference ?? "").trim();
        const definition = getTrustedPluginPackage(pluginId);
        if (!definition || !definition.purchasable || !providerReference || providerReference.length > 200 || /[\u0000-\u001f\u007f]/.test(providerReference)) {
          return reply.code(400).send({ error: "A purchasable plugin and a valid providerReference (1-200 characters) are required" });
        }
        type Purchase = import("mongodb").Document & {
          id: string; tenantId: string; pluginId: string; providerReference: string;
          status: "active" | "revoked" | "expired"; purchasedAt: Date; expiresAt: Date | null;
        };
        const purchases = new TenantCollection<Purchase>(db.collection<Purchase>("plugin_purchases"), tenantId);
        const current = await purchases.findOne({ providerReference });
        if (current && current.pluginId !== pluginId) {
          return reply.code(409).send({ error: "Provider reference is already bound to a different plugin" });
        }

        let changed = false;
        if (body.event === "plugin.purchase") {
          const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
          if (expiresAt && Number.isNaN(expiresAt.getTime())) return reply.code(400).send({ error: "Invalid purchase expiry date" });
          const sameExpiry = (current?.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null);
          if (!current) {
            try {
              await purchases.insertOne({
                id: randomUUID(), pluginId, providerReference, status: "active",
                purchasedAt: new Date(), expiresAt
              });
              changed = true;
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) throw error;
              const raced = await purchases.findOne({ providerReference });
              if (!raced || raced.pluginId !== pluginId) {
                return reply.code(409).send({ error: "Provider reference is already bound to a different plugin" });
              }
              const racedExpiry = raced.expiresAt?.getTime() ?? null;
              if (raced.status !== "active" || racedExpiry !== (expiresAt?.getTime() ?? null)) {
                const update = await purchases.updateOne(
                  { providerReference, pluginId, status: raced.status, expiresAt: raced.expiresAt ?? null },
                  { $set: { status: "active", expiresAt } }
                );
                if (update.matchedCount) {
                  changed = true;
                } else {
                  const latest = await purchases.findOne({ providerReference });
                  if (!latest || latest.pluginId !== pluginId || latest.status !== "active" || (latest.expiresAt?.getTime() ?? null) !== (expiresAt?.getTime() ?? null)) {
                    return reply.code(409).send({ error: "Purchase changed concurrently; retry the event" });
                  }
                }
              }
            }
          } else if (current.status !== "active" || !sameExpiry) {
            const update = await purchases.updateOne(
              { providerReference, pluginId, status: current.status, expiresAt: current.expiresAt ?? null },
              { $set: { status: "active", expiresAt } }
            );
            if (update.matchedCount) {
              changed = true;
            } else {
              const latest = await purchases.findOne({ providerReference });
              if (!latest || latest.pluginId !== pluginId || latest.status !== "active" || (latest.expiresAt?.getTime() ?? null) !== (expiresAt?.getTime() ?? null)) {
                return reply.code(409).send({ error: "Purchase changed concurrently; retry the event" });
              }
            }
          }
          if (changed) {
            await auditMarketplaceEvent({
              tenantId,
              actorId: "billing-webhook",
              action: "plugin.entitlement_granted",
              outcome: "success",
              resourceType: "plugin_purchase",
              resourceId: providerReference,
              metadata: { pluginId, providerReference, expiresAt: expiresAt?.toISOString() ?? null }
            });
            await ctx.events.emit("plugin.entitlement.updated", { tenantId, pluginId, event: body.event });
          }
        } else {
          if (!current) return reply.code(404).send({ error: "Purchase reference not found" });
          if (current.pluginId !== pluginId) {
            return reply.code(409).send({ error: "Provider reference is bound to a different plugin" });
          }
          if (current.status !== "revoked") {
            const update = await purchases.updateOne(
              { providerReference, pluginId, status: current.status },
              { $set: { status: "revoked" } }
            );
            if (update.matchedCount) {
              changed = true;
            } else {
              const latest = await purchases.findOne({ providerReference });
              if (!latest || latest.pluginId !== pluginId || latest.status !== "revoked") {
                return reply.code(409).send({ error: "Purchase changed concurrently; retry the event" });
              }
            }
            if (changed) {
              await auditMarketplaceEvent({
                tenantId,
                actorId: "billing-webhook",
                action: "plugin.entitlement_revoked",
                outcome: "success",
                resourceType: "plugin_purchase",
                resourceId: providerReference,
                metadata: { pluginId, providerReference }
              });
              await ctx.events.emit("plugin.entitlement.updated", { tenantId, pluginId, event: body.event });
            }
          }
        }
        return { success: true, event: body.event, changed };
      }

      return reply.code(400).send({ error: "Unsupported entitlement event" });
    });


    const authenticate = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
        const tenant = await resolveTenantContext(db, request.user, {}, sessionIdSecret);
        if (!tenant) {
          reply.code(401).send({ error: "Unauthorized or active company session required" });
          return null;
        }
        if (tenant.client !== "dashboard") {
          reply.code(403).send({ error: "Plugin marketplace management requires a dashboard session" });
          return null;
        }
        try {
          // Decode masked route IDs once and retain the canonical values separately
          // from Fastify's route-parameter object.
          const resourceIds: Record<string,string> = {};
          if (request.params?.pluginId) resourceIds.pluginId=unmaskResourceId(String(request.params.pluginId),"plugin",sessionOf(tenant),sessionIdSecret);
          if (request.params?.jobId) resourceIds.jobId=unmaskResourceId(String(request.params.jobId),"job",sessionOf(tenant),sessionIdSecret);
          request.resourceIds = resourceIds;
          // Keep the existing contract for handlers that read request.params.
          Object.assign(request.params ?? {}, resourceIds);
        } catch {
          ctx.logger.warn("Marketplace request rejected: invalid masked resource reference", {
            route: String(request.routerPath ?? request.routeOptions?.url ?? "unknown"),
            resourceType: request.params?.jobId ? "job" : request.params?.pluginId ? "plugin" : "unknown"
          });
          reply.code(404).send({error:"Resource not found"});
          return null;
        }
        if (!hasTenantPermission(tenant, "plugins.read")) {
          await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"permission.denied",outcome:"denied",resourceType:"permission",metadata:{permission:"plugins.read"}});
          reply.code(403).send({ error: "Plugin catalog permission required" });
          return null;
        }
        return tenant;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };

    ctx.server.get("/marketplace/entitlements", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const [subscription, catalog] = await Promise.all([
        getTenantSubscription(db, tenant.tenantId),
        getTenantPluginCatalog(db, tenant.tenantId)
      ]);
      return {
        tenantId: mask(tenant,tenant.tenantId,"tenant"),
        subscription: {
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd
        },
        entitlements: catalog.filter(plugin => plugin.entitled).map(plugin => ({
          pluginId: mask(tenant,plugin.id,"plugin"),
          source: plugin.accessSource,
          installed: plugin.installed
        }))
      };
    });

    ctx.server.get("/marketplace/plugins", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      return { tenantId: mask(tenant,tenant.tenantId,"tenant"), plugins: (await getTenantPluginCatalog(db, tenant.tenantId)).map(plugin=>publicPlugin(tenant,plugin)) };
    });
    ctx.server.put<{Params:{pluginId:string};Body:{enabled?:boolean}}>("/marketplace/plugins/:pluginId/activation",async(request:any,reply:any)=>{
      const tenant=await authenticate(request,reply);if(!tenant)return;
      const pluginId=String(request.params.pluginId??"");
      if(!hasTenantPermission(tenant,"plugins.manage")){
        await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"permission.denied",outcome:"denied",resourceType:"permission",resourceId:pluginId,metadata:{permission:"plugins.manage"}});
        return reply.code(403).send({error:"Plugin management permission required"});
      }
      if(typeof request.body?.enabled!=="boolean")return reply.code(400).send({error:"enabled must be a boolean"});
      if(request.body.enabled&&!await isPlatformPluginEnabled(db,pluginId))return reply.code(409).send({error:"This plugin is suspended globally by the platform administrator"});
      if(request.body.enabled&&!await hasPluginEntitlement(db,tenant.tenantId,pluginId))return reply.code(402).send({error:"This company plan or an active plugin purchase does not include this package"});
      const definition=await getMarketplacePackage(pluginId);
      if(!definition)return reply.code(404).send({error:"Plugin package is not available"});
      const globalPackage=await db.collection("platform_plugin_packages").findOne({pluginId,status:"installed"});
      const builtInPackage=getTrustedPluginPackage(pluginId);
      if(!builtInPackage&&(!globalPackage||(globalPackage.source==="zip"&&globalPackage.runtimeState!=="loaded")))return reply.code(409).send({error:"Plugin package is not ready on the platform"});
      const installations=db.collection("tenant_plugin_installations");
      const installation=await installations.findOne({tenantId:tenant.tenantId,pluginId});
      const activeJob=await installJobs.findOne({activeKey:tenant.tenantId+":"+pluginId});
      if(activeJob)return reply.code(409).send({error:"A plugin lifecycle operation is already in progress"});
      const currentEnabled=installation?.status==="installed"&&installation.enabled!==false;
      if(request.body.enabled===currentEnabled)return {success:true,pluginId:mask(tenant,pluginId,"plugin"),installed:installation?.status==="installed",enabled:currentEnabled,unchanged:true};
      if(!request.body.enabled){
        if(installation?.status==="installed"){
          const otherInstallations=await installations.find({tenantId:tenant.tenantId,status:"installed",pluginId:{$ne:pluginId},enabled:{$ne:false}}).toArray();
          for(const other of otherInstallations){
            const dependent=await getMarketplacePackage(String(other.pluginId));
            if(dependent?.dependencies.includes(pluginId))return reply.code(409).send({error:"Cannot deactivate this plugin while the dependent plugin is active: "+String(other.pluginId)});
          }
          const now=new Date();
          await installations.updateOne({tenantId:tenant.tenantId,pluginId,status:"installed"},{$set:{enabled:false,enabledUpdatedAt:now,enabledUpdatedBy:tenant.userId,updatedAt:now}});
        }
      }else{
        for(const dependencyId of await getDependencyOrder(pluginId)){
          const dependencyDefinition=await getMarketplacePackage(dependencyId);
          const dependencyPackage=await db.collection("platform_plugin_packages").findOne({pluginId:dependencyId,status:"installed"});
          const dependencyReady=Boolean(dependencyDefinition)&&(Boolean(getTrustedPluginPackage(dependencyId))||Boolean(dependencyPackage&&(dependencyPackage.source!=="zip"||dependencyPackage.runtimeState==="loaded")));
          if(!dependencyReady||!await hasPluginEntitlement(db,tenant.tenantId,dependencyId)||!await isPluginInstalled(db,tenant.tenantId,dependencyId)||!await isPluginEnabled(db,tenant.tenantId,dependencyId)){
            return reply.code(409).send({error:"Activate the required plugin first: "+dependencyId});
          }
        }
        if(installation&&installation.status!=="installed"&&installation.status!=="uninstalled"&&installation.status!=="failed")return reply.code(409).send({error:"Plugin installation state is changing; refresh and try again"});
        const now=new Date();
        if(!installation||installation.status!=="installed"){
          const tenantMigrations=selectTenantMigrations(definition,"install");
          const migrationRun=await runTenantPluginMigrations(db,tenant.tenantId,pluginId,tenantMigrations);
          try{
            await definition.installTenant?.(db,tenant.tenantId);
            await installations.updateOne(
              {tenantId:tenant.tenantId,pluginId},
              {$set:{status:"installed",version:String(globalPackage?.version??definition.version),installedAt:now,updatedAt:now,enabled:true,enabledUpdatedAt:now,enabledUpdatedBy:tenant.userId},
               $setOnInsert:{id:randomUUID(),tenantId:tenant.tenantId,pluginId}},
              {upsert:true}
            );
          }catch(error){
            const rollback=await rollbackTenantPluginMigrations(db,tenant.tenantId,pluginId,tenantMigrations,migrationRun.applied);
            if(rollback.failed.length)ctx.logger.error("Tenant plugin activation rollback was incomplete",{tenantId:tenant.tenantId,pluginId,failedMigrations:rollback.failed});
            throw error;
          }
        }else{
          await installations.updateOne({tenantId:tenant.tenantId,pluginId,status:"installed"},{$set:{enabled:true,enabledUpdatedAt:now,enabledUpdatedBy:tenant.userId,updatedAt:now}});
        }
      }
      const enabled=request.body.enabled;
      await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:enabled?"plugin.enabled":"plugin.disabled",outcome:"success",resourceType:"plugin",resourceId:pluginId,metadata:{enabled,platformVersion:String(globalPackage?.version??definition.version)}});
      return {success:true,pluginId:mask(tenant,pluginId,"plugin"),installed:enabled||installation?.status==="installed",enabled,status:"installed"};
    });

    ctx.server.get<{Params:{pluginId:string}}>("/marketplace/plugins/:pluginId/runtime",async(request:any,reply:any)=>{
      const tenant=await authenticate(request,reply);if(!tenant)return;
      const pluginId=String(request.resourceIds?.pluginId ?? request.params?.pluginId ?? "");
      if(!pluginId)return reply.code(404).send({error:"Resource not found"});
      const plugin=(await getTenantPluginCatalog(db,tenant.tenantId)).find(item=>item.id===pluginId);
      if(!plugin||!plugin.entitled||!plugin.installed||!plugin.enabled||!await isPlatformPluginEnabled(db,pluginId))return reply.code(403).send({error:"Plugin is not available for this company"});
      // Resolve the platform package independently from its in-memory runtime state.
      // Filtering by runtimeState in Mongo made a missing/stale state indistinguishable
      // from a package that was never installed, hiding the actual loader failure.
      const globalPackage=await db.collection("platform_plugin_packages").findOne({pluginId,status:"installed",source:"zip"});
      if(!globalPackage){
        ctx.logger.warn("Marketplace runtime request has no installed ZIP package", {pluginId,tenantId:tenant.tenantId});
        return reply.code(404).send({error:"Plugin package is not installed on the platform"});
      }
      if(globalPackage.runtimeState!=="loaded"){
        ctx.logger.warn("Marketplace runtime package is not loaded", {
          pluginId,
          tenantId:tenant.tenantId,
          runtimeState:String(globalPackage.runtimeState??"missing"),
          version:String(globalPackage.version??"unknown")
        });
        return reply.code(503).send({error:"Plugin runtime is not loaded"});
      }
      const version=String(globalPackage.version??"");
      const versionRecord=await db.collection("platform_plugin_package_versions").findOne({pluginId:plugin.id,version});
      const manifest=versionRecord?.manifest as {frontend?:{entrypoint?:string;apiPrefixes?:string[];routes?:Array<{path:string;component:string}>}}|undefined;
      if(!manifest?.frontend?.entrypoint)return reply.code(404).send({error:"Plugin has no packaged frontend"});
      return {pluginId:plugin.id,version,entrypoint:manifest.frontend.entrypoint,apiPrefixes:manifest.frontend.apiPrefixes??[],routes:manifest.frontend.routes??[]};
    });
    ctx.server.get("/public/tenant/plugins", async (request: any, reply: any) => {
      const hostname = String(request.hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
      const baseDomain = String(ctx.config.publicBaseDomain ?? "beecore.beeprojects.net").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
      const slug = tenantSlugFromHost(hostname, baseDomain);
      let company: any = null;
      if (slug) company = await db.collection("tenants").findOne({ slug, status: { $ne: "suspended" } });
      else if (!hostname.endsWith("." + baseDomain) && hostname !== baseDomain) company = await db.collection("tenants").findOne({ domains: hostname, status: { $ne: "suspended" } });
      if (!company) return reply.code(404).send({ error: "Public tenant not found" });
      const plugins = await getTenantPluginCatalog(db, String(company.id));
      return { pluginIds: plugins.filter((plugin: any) => plugin.installed && plugin.enabled && plugin.entitled).map((plugin: any) => plugin.id) };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const plugin = (await getTenantPluginCatalog(db, tenant.tenantId)).find(item => item.id === request.params.pluginId);
      if (!plugin) return reply.code(404).send({ error: "Plugin not visible to this company" });
      return { plugin: publicPlugin(tenant,plugin) };
    });

    ctx.server.get<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/versions", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const plugin = (await getTenantPluginCatalog(db, tenant.tenantId)).find(item => item.id === request.params.pluginId);
      if (!plugin || !plugin.entitled) return reply.code(404).send({ error: "Plugin version information is unavailable" });
      const publishedVersions = await db.collection("plugin_versions")
        .find({ pluginId: plugin.id, status: "published" })
        .sort({ publishedAt: -1 })
        .toArray();
      return {
        pluginId: mask(tenant,plugin.id,"plugin"),
        versions: publishedVersions.map(item => ({
          version: item.version,
          compatibility: item.compatibility ?? null,
          dependencies: item.dependencies ?? [],
          publishedAt: item.publishedAt ?? null
        }))
      };
    });

    ctx.server.post<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/install", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "plugins.install")) {
        await auditMarketplaceEvent({tenantId:tenant.tenantId,actorId:tenant.userId,action:"permission.denied",outcome:"denied",resourceType:"permission",resourceId:request.params.pluginId,metadata:{permission:"plugins.install"}});
        return reply.code(403).send({ error: "Plugin installation permission required" });
      }
      const pluginId = String(request.params.pluginId ?? "");
      const catalog = await getTenantPluginCatalog(db, tenant.tenantId);
      const plugin = catalog.find(item => item.id === pluginId);
      if (!plugin) return reply.code(404).send({ error: "Plugin not visible to this company" });
      if (!plugin.entitled) return reply.code(402).send({ error: "An active plan entitlement or plugin purchase is required" });
      const externalPackage = await db.collection("platform_plugin_packages").findOne({ pluginId, source: "zip" });
      if (externalPackage && externalPackage.status !== "installed") return reply.code(409).send({ error: "External plugin package is not available for new installations" });
      const trusted = await getMarketplacePackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Trusted plugin package is unavailable" });
      for (const dependency of await getDependencyOrder(pluginId)) {
        if (!await hasPluginEntitlement(db, tenant.tenantId, dependency) || !await isPluginInstalled(db, tenant.tenantId, dependency) || !await isPluginEnabled(db, tenant.tenantId, dependency)) {
          return reply.code(409).send({ error: "Required plugin dependency is not installed: " + dependency });
        }
      }
      const activeKey = tenant.tenantId + ":" + pluginId;
      const activeJob = await installJobs.findOne({ activeKey });
      if (activeJob) {
        if (activeJob.action !== "install") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
        return reply.code(202).send({ jobId: mask(tenant,activeJob.id,"job"), pluginId: mask(tenant,pluginId,"plugin"), action: "install", status: activeJob.status, accepted: true, duplicate: true, statusUrl: "/marketplace/install-jobs/" + mask(tenant,activeJob.id,"job") });
      }
      if (await isPluginInstalled(db, tenant.tenantId, pluginId)) {
        return { pluginId: mask(tenant,pluginId,"plugin"), status: "installed", alreadyInstalled: true };
      }
      const queued = await enqueuePluginInstallJob(installJobs, { tenantId: tenant.tenantId, pluginId, actorId: tenant.userId });
      if (queued.job.action !== "install") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
      return reply.code(202).send({
        jobId: mask(tenant,queued.job.id,"job"),
        pluginId: mask(tenant,pluginId,"plugin"),
        status: queued.job.status,
        accepted: true,
        duplicate: !queued.created,
        statusUrl: "/marketplace/install-jobs/" + mask(tenant,queued.job.id,"job")
      });
    });

    ctx.server.post<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/update", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const pluginId = String(request.params.pluginId ?? "");
      if (!hasTenantPermission(tenant, "plugins.manage")) {
        await auditMarketplaceEvent({ tenantId: tenant.tenantId, actorId: tenant.userId, action: "permission.denied", outcome: "denied", resourceType: "permission", resourceId: pluginId, metadata: { permission: "plugins.manage" } });
        return reply.code(403).send({ error: "Plugin management permission required" });
      }
      if (!await hasPluginEntitlement(db, tenant.tenantId, pluginId)) return reply.code(402).send({ error: "An active plan entitlement or plugin purchase is required" });
      const trusted = await getMarketplacePackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Trusted plugin package is unavailable" });
      const installation = await db.collection("tenant_plugin_installations").findOne({ tenantId: tenant.tenantId, pluginId });
      if (!installation || installation.status !== "installed") return reply.code(409).send({ error: "Only an installed plugin can be updated" });
      const previousVersion = String(installation.version ?? "");
      if (!previousVersion || previousVersion === trusted.version) return reply.code(409).send({ error: "Plugin is already at the latest trusted version" });
      const activeJob = await installJobs.findOne({ activeKey: tenant.tenantId + ":" + pluginId });
      if (activeJob) {
        if (activeJob.action !== "update") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
        return reply.code(202).send({ jobId: mask(tenant,activeJob.id,"job"), pluginId: mask(tenant,pluginId,"plugin"), action: "update", status: activeJob.status, accepted: true, duplicate: true, statusUrl: "/marketplace/install-jobs/" + mask(tenant,activeJob.id,"job") });
      }
      const queued = await enqueuePluginUpdateJob(installJobs, { tenantId: tenant.tenantId, pluginId, actorId: tenant.userId, previousVersion });
      if (queued.job.action !== "update") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
      return reply.code(202).send({ jobId: mask(tenant,queued.job.id,"job"), pluginId: mask(tenant,pluginId,"plugin"), action: "update", status: queued.job.status, accepted: true, duplicate: !queued.created, statusUrl: "/marketplace/install-jobs/" + mask(tenant,queued.job.id,"job") });
    });

    ctx.server.get<{ Params: { jobId: string } }>("/marketplace/install-jobs/:jobId", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const job = await installJobs.findOne(
        { id: String(request.params.jobId), tenantId: tenant.tenantId },
        { projection: { _id: 0, id: 1, pluginId: 1, action: 1, status: 1, attempts: 1, maxAttempts: 1, createdAt: 1, updatedAt: 1, startedAt: 1, finishedAt: 1 } }
      );
      if (!job) return reply.code(404).send({ error: "Installation job not found" });
      return { job: { ...publicJob(tenant,job), ...(job.status === "failed" ? { error: "Plugin " + job.action + " failed. Contact an administrator." } : {}) } };
    });

    ctx.server.delete<{ Params: { pluginId: string } }>("/marketplace/plugins/:pluginId/install", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (!hasTenantPermission(tenant, "plugins.manage")) {
        await auditMarketplaceEvent({ tenantId: tenant.tenantId, actorId: tenant.userId, action: "permission.denied", outcome: "denied", resourceType: "permission", resourceId: request.params.pluginId, metadata: { permission: "plugins.manage" } });
        return reply.code(403).send({ error: "Plugin management permission required" });
      }
      const pluginId = String(request.params.pluginId ?? "");
      const trusted = await getMarketplacePackage(pluginId);
      if (!trusted) return reply.code(404).send({ error: "Plugin package not found" });
      if (trusted.system) return reply.code(409).send({ error: "System plugins cannot be uninstalled" });
      const activeKey = tenant.tenantId + ":" + pluginId;
      const activeJob = await installJobs.findOne({ activeKey });
      if (activeJob) {
        if (activeJob.action !== "uninstall") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
        return reply.code(202).send({ jobId: mask(tenant,activeJob.id,"job"), pluginId: mask(tenant,pluginId,"plugin"), action: "uninstall", status: activeJob.status, accepted: true, duplicate: true, statusUrl: "/marketplace/install-jobs/" + mask(tenant,activeJob.id,"job") });
      }
      if (!await isPluginInstalled(db, tenant.tenantId, pluginId)) return reply.code(404).send({ error: "Plugin is not installed" });
      const otherInstalled = await db.collection("tenant_plugin_installations")
        .find({ tenantId: tenant.tenantId, status: "installed", pluginId: { $ne: pluginId } })
        .toArray();
      for (const installed of otherInstalled) {
        const dependent = await getMarketplacePackage(String(installed.pluginId));
        if (dependent?.dependencies.includes(pluginId)) return reply.code(409).send({ error: "Plugin is required by installed plugin: " + installed.pluginId });
      }
      const queued = await enqueuePluginUninstallJob(installJobs, { tenantId: tenant.tenantId, pluginId, actorId: tenant.userId });
      if (queued.job.action !== "uninstall") return reply.code(409).send({ error: "A plugin lifecycle operation is already in progress" });
      return reply.code(202).send({
        jobId: mask(tenant,queued.job.id,"job"), pluginId: mask(tenant,pluginId,"plugin"), action: "uninstall", status: queued.job.status,
        accepted: true, duplicate: !queued.created, statusUrl: "/marketplace/install-jobs/" + mask(tenant,queued.job.id,"job")
      });
    });

    let workerBusy = false;
    const workerId = randomUUID();
    const processInstallJob = async () => {
      if (workerBusy) return;
      workerBusy = true;
      try {
        const job = await claimPluginInstallJob(installJobs, workerId);
        if (!job) return;
        const leaseHeartbeat = setInterval(() => {
          void renewPluginInstallJobLease(installJobs, job, workerId).then(renewed => {
            if (!renewed) ctx.logger.warn("Plugin lifecycle worker lease was lost", { tenantId: job.tenantId, pluginId: job.pluginId, jobId: job.id });
          }).catch(error => ctx.logger.error("Plugin lifecycle worker lease renewal failed", { jobId: job.id, error }));
        }, 20_000);
        leaseHeartbeat.unref();
        try {
          const tenantRecord = await db.collection("tenants").findOne({ id: job.tenantId, status: "active" });
          if (!tenantRecord) throw new Error("Company is not active");
          const trusted = await getMarketplacePackage(job.pluginId);
          if (!trusted) throw new Error("Trusted plugin package is unavailable");

          if (job.action === "uninstall") {
            if (trusted.system) throw new Error("System plugins cannot be uninstalled");
            const installation = await db.collection("tenant_plugin_installations").findOne({ tenantId: job.tenantId, pluginId: job.pluginId });
            if (!installation || !["installed", "uninstalling"].includes(String(installation.status))) throw new Error("Plugin is not installed");
            const otherInstalled = await db.collection("tenant_plugin_installations")
              .find({ tenantId: job.tenantId, status: "installed", pluginId: { $ne: job.pluginId } })
              .toArray();
            for (const installed of otherInstalled) {
              const dependent = await getMarketplacePackage(String(installed.pluginId));
              if (dependent?.dependencies.includes(job.pluginId)) throw new Error("Plugin is required by installed plugin: " + installed.pluginId);
            }
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: { $in: ["installed", "uninstalling"] } },
              { $set: { status: "uninstalling", updatedAt: new Date() } }
            );
            // External package uninstall must retain tenant-owned collections.
            // Data cleanup is a separate, explicit operation and is never implicit in uninstall.
            const externalRuntimePackage = !getTrustedPluginPackage(job.pluginId) && Boolean(getRuntimePlugin(job.pluginId));
            if (!externalRuntimePackage) await trusted.uninstallTenant?.(db, job.tenantId);
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "uninstalling" },
              { $set: { status: "uninstalled", updatedAt: new Date() }, $unset: { error: "" } }
            );
            if (tenantRecord.kind === "super") await setPlatformPackageAvailable(db, job.pluginId);
            const completed = await completePluginInstallJob(installJobs, job, workerId, trusted.version);
            if (completed) await auditMarketplaceEvent({ tenantId: job.tenantId, actorId: job.actorId, action: "plugin.uninstalled", outcome: "success", resourceType: "plugin", resourceId: job.pluginId, metadata: { version: trusted.version, jobId: job.id } });
          } else if (job.action === "install") {
            if (!await hasPluginEntitlement(db, job.tenantId, job.pluginId)) throw new Error("Plugin entitlement is no longer active");
            for (const dependency of await getDependencyOrder(job.pluginId)) {
              if (!await hasPluginEntitlement(db, job.tenantId, dependency) || !await isPluginInstalled(db, job.tenantId, dependency) || !await isPluginEnabled(db, job.tenantId, dependency)) {
                throw new Error("Required plugin dependency is not installed: " + dependency);
              }
            }
            const installations = db.collection("tenant_plugin_installations");
            await installations.updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId },
              { $set: { status: "installing", version: trusted.version, updatedAt: new Date(), error: null }, $setOnInsert: { id: randomUUID(), tenantId: job.tenantId, pluginId: job.pluginId, installedAt: null } },
              { upsert: true }
            );
            const tenantMigrations = selectTenantMigrations(trusted,"install");
            const migrationRun = await runTenantPluginMigrations(db, job.tenantId, job.pluginId, tenantMigrations);
            try {
              await trusted.installTenant?.(db, job.tenantId);
              const installedAt = new Date();
              await installations.updateOne(
                { tenantId: job.tenantId, pluginId: job.pluginId },
                { $set: { status: "installed", version: trusted.version, installedAt, updatedAt: installedAt, enabled: true, enabledUpdatedAt: installedAt, enabledUpdatedBy: job.actorId }, $unset: { error: "" } }
              );
              if (tenantRecord.kind === "super") {
                await setPlatformPackageInstalled(db, job.pluginId, trusted.version, job.actorId);
                await syncAutomaticPluginProvisioning(db, job.pluginId);
              }
            } catch (error) {
              const rollback = await rollbackTenantPluginMigrations(db, job.tenantId, job.pluginId, tenantMigrations, migrationRun.applied);
              if (rollback.failed.length) {
                ctx.logger.error("Plugin installation migration compensation was incomplete", { tenantId: job.tenantId, pluginId: job.pluginId, failedMigrations: rollback.failed });
              }
              throw error;
            }
            const completed = await completePluginInstallJob(installJobs, job, workerId, trusted.version);
            if (completed) await auditMarketplaceEvent({ tenantId: job.tenantId, actorId: job.actorId, action: "plugin.installed", outcome: "success", resourceType: "plugin", resourceId: job.pluginId, metadata: { version: trusted.version, jobId: job.id } });
          } else {
            if (!await hasPluginEntitlement(db, job.tenantId, job.pluginId)) throw new Error("Plugin entitlement is no longer active");
            for (const dependency of await getDependencyOrder(job.pluginId)) {
              if (!await hasPluginEntitlement(db, job.tenantId, dependency) || !await isPluginInstalled(db, job.tenantId, dependency) || !await isPluginEnabled(db, job.tenantId, dependency)) {
                throw new Error("Required plugin dependency is not installed: " + dependency);
              }
            }
            const installations = db.collection("tenant_plugin_installations");
            const installation = await installations.findOne({ tenantId: job.tenantId, pluginId: job.pluginId });
            if (!installation || !["installed", "updating"].includes(String(installation.status))) throw new Error("Plugin is not installed");
            const previousVersion = String(installation.version ?? job.previousVersion ?? "");
            if (!previousVersion) throw new Error("Installed plugin version is missing");
            if (installation.status === "installed" && previousVersion === trusted.version) {
              // A worker may have committed the version switch but crashed before completing its durable job.
              await completePluginInstallJob(installJobs, job, workerId, trusted.version);
            } else {
              if (previousVersion === trusted.version) throw new Error("Plugin update state is inconsistent");
              await installations.updateOne(
                { tenantId: job.tenantId, pluginId: job.pluginId, status: { $in: ["installed", "updating"] } },
                { $set: { status: "updating", updatedAt: new Date(), error: null } }
              );
              const tenantMigrations = selectTenantMigrations(trusted,"upgrade");
              const migrationRun = await runTenantPluginMigrations(db, job.tenantId, job.pluginId, tenantMigrations);
              try {
                await trusted.updateTenant?.(db, job.tenantId, previousVersion);
                await installations.updateOne(
                  { tenantId: job.tenantId, pluginId: job.pluginId, status: "updating" },
                  { $set: { status: "installed", version: trusted.version, updatedAt: new Date() }, $unset: { error: "" } }
                );
              } catch (error) {
                const rollback = await rollbackTenantPluginMigrations(db, job.tenantId, job.pluginId, tenantMigrations, migrationRun.applied);
                if (rollback.failed.length) {
                  ctx.logger.error("Plugin update migration compensation was incomplete", { tenantId: job.tenantId, pluginId: job.pluginId, failedMigrations: rollback.failed });
                }
                throw error;
              }
              const completed = await completePluginInstallJob(installJobs, job, workerId, trusted.version);
              if (completed) await auditMarketplaceEvent({ tenantId: job.tenantId, actorId: job.actorId, action: "plugin.updated", outcome: "success", resourceType: "plugin", resourceId: job.pluginId, metadata: { fromVersion: previousVersion, version: trusted.version, jobId: job.id } });
            }
          }
        } catch (error) {
          if (job.action === "install") {
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "installing" },
              { $set: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Plugin installation failed", updatedAt: new Date() } }
            );
          } else if (job.action === "uninstall") {
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "uninstalling" },
              { $set: { status: "installed", error: error instanceof Error ? error.message.slice(0, 500) : "Plugin uninstallation failed", updatedAt: new Date() } }
            );
          } else {
            await db.collection("tenant_plugin_installations").updateOne(
              { tenantId: job.tenantId, pluginId: job.pluginId, status: "updating" },
              { $set: { status: "installed", version: job.previousVersion ?? "", error: error instanceof Error ? error.message.slice(0, 500) : "Plugin update failed", updatedAt: new Date() } }
            );
          }
          await failPluginInstallJob(installJobs, job, workerId, error);
          ctx.logger.error("Tenant plugin lifecycle job failed", { tenantId: job.tenantId, pluginId: job.pluginId, jobId: job.id, error });
        } finally {
          clearInterval(leaseHeartbeat);
        }
      } catch (error) {
        ctx.logger.error("Plugin lifecycle worker failed to claim a job", { error });
      } finally {
        workerBusy = false;
      }
    };
    installWorkerTask = processInstallJob();
    installWorkerTimer = setInterval(() => {
      if (!workerBusy) installWorkerTask = processInstallJob();
    }, 500);

    ctx.logger.info("Marketplace plugin initialized: company catalog is filtered by plan and purchase entitlements.");
  },
  async stop() {
    if (installWorkerTimer) clearInterval(installWorkerTimer);
    installWorkerTimer = undefined;
    await installWorkerTask;
    installWorkerTask = undefined;
  }
};
