import type { BeePlugin } from "../../core/types.js";
import { resolveTenantContext } from "../../core/tenant-context.js";

const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" }
] as const;
const isLocale = (value: unknown): value is "en" | "es" => value === "en" || value === "es";
type Claims = { aud?: string; sub?: string; sid?: string; client?: "backend" | "dashboard" | "public" };

export const localizationPlugin: BeePlugin = {
  manifest: { requiredServices: ["mongoDbName","sessionIdSecret"], optionalServices: [],
    name: "localization",
    version: "0.1.0",
    description: "Core language preferences, team defaults and locale resolution",
    dependencies: ["auth", "organizations"]
  },
  async initialize(ctx) {
    const db = ctx.mongoClient.db(String(ctx.config.mongoDbName ?? "bee_core"));
    const sessionSecret = String(ctx.config.sessionIdSecret ?? ctx.config.jwtSecret ?? "");
    const users = db.collection<{ id: string; locale?: string }>("users");
    const tenants = db.collection<{ id: string; settings?: { defaultLanguage?: string } }>("tenants");

    const authenticate = async (request: any, reply: any) => {
      try {
        await request.jwtVerify();
        const tenant = await resolveTenantContext(db, request.user as Claims, {}, sessionSecret);
        if (!tenant || tenant.client !== "dashboard") {
          reply.code(401).send({ error: "An authenticated workspace session is required" });
          return null;
        }
        return tenant;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
        return null;
      }
    };

    ctx.server.get("/i18n/preferences", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const [user, company] = await Promise.all([
        users.findOne({ id: tenant.userId }, { projection: { locale: 1 } }),
        tenants.findOne({ id: tenant.tenantId }, { projection: { settings: 1 } })
      ]);
      const userLanguage = isLocale(user?.locale) ? user.locale : null;
      const teamDefaultLanguage = isLocale(company?.settings?.defaultLanguage) ? company!.settings!.defaultLanguage as "en" | "es" : "en";
      return {
        languages: SUPPORTED_LANGUAGES,
        userLanguage,
        teamDefaultLanguage,
        effectiveLanguage: userLanguage ?? teamDefaultLanguage,
        canManageTeamDefault: tenant.role === "owner" || tenant.role === "admin"
      };
    });

    ctx.server.put<{ Body: { language?: string | null } }>("/i18n/preferences", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      const language = request.body?.language;
      if (language !== null && !isLocale(language)) {
        return reply.code(400).send({ error: "language must be 'en', 'es' or null to inherit the team default" });
      }
      await users.updateOne(
        { id: tenant.userId },
        language === null ? { $unset: { locale: "" } } : { $set: { locale: language } }
      );
      const company = await tenants.findOne({ id: tenant.tenantId }, { projection: { settings: 1 } });
      const teamDefaultLanguage = isLocale(company?.settings?.defaultLanguage) ? company!.settings!.defaultLanguage as "en" | "es" : "en";
      return { success: true, userLanguage: language, effectiveLanguage: language ?? teamDefaultLanguage };
    });

    ctx.server.put<{ Body: { language?: string } }>("/i18n/team-default", async (request: any, reply: any) => {
      const tenant = await authenticate(request, reply);
      if (!tenant) return;
      if (tenant.role !== "owner" && tenant.role !== "admin") {
        return reply.code(403).send({ error: "Only company owners and administrators can change the team default language" });
      }
      const language = request.body?.language;
      if (!isLocale(language)) return reply.code(400).send({ error: "language must be 'en' or 'es'" });
      await tenants.updateOne({ id: tenant.tenantId }, { $set: { "settings.defaultLanguage": language } });
      const user = await users.findOne({ id: tenant.userId }, { projection: { locale: 1 } });
      return { success: true, teamDefaultLanguage: language, effectiveLanguage: isLocale(user?.locale) ? user.locale : language };
    });

    ctx.logger.info("Localization engine initialized", { languages: SUPPORTED_LANGUAGES.map(language => language.code) });
  }
};
