/** Host capabilities are named, allowlisted services rather than plugin-ID-specific config maps. */
export const CORE_PLUGIN_SERVICE_CONFIG: Readonly<Record<string, readonly string[]>> = Object.freeze({
  mongo: ["mongoDbName"],
  "session-resource-ids": ["sessionIdSecret"],
  "file-storage": ["fileStoragePath"],
  "auth-bootstrap": ["defaultTenantId", "authAdminEmail", "authAdminPassword", "authMfaEncryptionKey"],
  "billing-webhook": ["billingWebhookSecret"],
  "public-domain": ["publicBaseDomain"],
  "plugin-package-storage": ["pluginPackagePath"],
  "plugin-publisher-public-key": ["pluginPublisherPublicKey"]
});
