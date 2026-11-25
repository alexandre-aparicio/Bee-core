/**
 * Runtime registry membership alone does not mean a plugin is an installable ZIP.
 * Core/legacy plugins may also be registered in the in-memory runtime registry.
 * Only an installed platform ZIP package is exposed through the remote-runtime API.
 */
export function isExternalRuntimePackage(
  pluginId: string,
  packageRecord: unknown,
  trustedPackage: boolean
): boolean {
  if (trustedPackage || !packageRecord || typeof packageRecord !== "object") return false;
  const record=packageRecord as {pluginId?:unknown;status?:unknown;source?:unknown};
  return record.pluginId === pluginId &&
    record.status === "installed" &&
    record.source === "zip";
}
