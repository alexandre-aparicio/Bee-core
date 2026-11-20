const RESERVED_TENANT_SLUGS = new Set([
  "www", "api", "admin", "app", "auth", "dashboard", "mail", "ftp",
  "beecore", "support", "help", "status", "docs", "static", "assets"
]);

export function slugifyTenantName(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 48).replace(/-+$/g, "");
  return normalizeTenantSlug(slug);
}

export function normalizeTenantSlug(value: unknown): string {
  const slug = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) {
    throw new Error("Tenant slug must use 1-48 lowercase letters, numbers or internal hyphens");
  }
  if (RESERVED_TENANT_SLUGS.has(slug)) throw new Error("This tenant slug is reserved");
  return slug;
}

export function tenantSlugFromHost(host: string, baseDomain: string): string | null {
  const normalizedHost = host.trim().toLowerCase().replace(/\.$/, "").split(":")[0];
  const normalizedBase = baseDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalizedBase || normalizedHost === normalizedBase) return null;
  const suffix = "." + normalizedBase;
  if (!normalizedHost.endsWith(suffix)) return null;
  const label = normalizedHost.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  try { return normalizeTenantSlug(label); } catch { return null; }
}
