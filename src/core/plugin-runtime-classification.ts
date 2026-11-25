export interface RuntimePackageClassificationRecord {
  pluginId?: unknown;
  status?: unknown;
  source?: unknown;
}

/**
 * Runtime registry membership alone does not mean a plugin is an installable ZIP.
 * Core/legacy plugins may also be registered in the in-memory runtime registry.
 * Only an installed platform ZIP package is exposed through the remote-runtime API.
 */
export function isExternalRuntimePackage(
  pluginId: string,
  packageRecord: RuntimePackageClassificationRecord | null | undefined,
  trustedPackage: boolean
): boolean {
  return !trustedPackage &&
    packageRecord?.pluginId === pluginId &&
    packageRecord.status === "installed" &&
    packageRecord.source === "zip";
}
