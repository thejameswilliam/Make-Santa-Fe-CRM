import { z } from "zod";

function normalizeExternalBaseUrl(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DATABASE_CA_CERT: z.string().optional(),
  WORDPRESS_BASE_URL: z.string().optional(),
  WORDPRESS_CRM_BRIDGE_TOKEN: z.string().optional(),
  WORDPRESS_SYNC_PAGE_SIZE: z.coerce.number().int().min(10).max(500).default(100),
  WORDPRESS_SYNC_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(300),
  WORDPRESS_SYNC_RETRY_COUNT: z.coerce.number().int().min(0).max(10).default(4),
  WORDPRESS_SYNC_RETRY_DELAY_MS: z.coerce.number().int().min(100).default(1500),
  CRM_SESSION_SECRET: z.string().optional(),
  CRM_APP_BASE_URL: z.string().optional(),
  CRM_SYNC_FRESHNESS_SECONDS: z.coerce.number().default(300),
  ALLOW_DEV_LOGIN: z.enum(["true", "false"]).default("true")
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_CA_CERT: process.env.DATABASE_CA_CERT,
  WORDPRESS_BASE_URL: process.env.WORDPRESS_BASE_URL,
  WORDPRESS_CRM_BRIDGE_TOKEN: process.env.WORDPRESS_CRM_BRIDGE_TOKEN,
  WORDPRESS_SYNC_PAGE_SIZE: process.env.WORDPRESS_SYNC_PAGE_SIZE,
  WORDPRESS_SYNC_REQUEST_DELAY_MS: process.env.WORDPRESS_SYNC_REQUEST_DELAY_MS,
  WORDPRESS_SYNC_RETRY_COUNT: process.env.WORDPRESS_SYNC_RETRY_COUNT,
  WORDPRESS_SYNC_RETRY_DELAY_MS: process.env.WORDPRESS_SYNC_RETRY_DELAY_MS,
  CRM_SESSION_SECRET: process.env.CRM_SESSION_SECRET,
  CRM_APP_BASE_URL: process.env.CRM_APP_BASE_URL,
  CRM_SYNC_FRESHNESS_SECONDS: process.env.CRM_SYNC_FRESHNESS_SECONDS,
  ALLOW_DEV_LOGIN: process.env.ALLOW_DEV_LOGIN
});

export const config = {
  databaseUrl: parsed.DATABASE_URL ?? "",
  databaseCaCert: parsed.DATABASE_CA_CERT?.trim() ?? "",
  wordpressBaseUrl: normalizeExternalBaseUrl(parsed.WORDPRESS_BASE_URL),
  wordpressBridgeToken: parsed.WORDPRESS_CRM_BRIDGE_TOKEN ?? "",
  wordpressSyncPageSize: parsed.WORDPRESS_SYNC_PAGE_SIZE,
  wordpressSyncRequestDelayMs: parsed.WORDPRESS_SYNC_REQUEST_DELAY_MS,
  wordpressSyncRetryCount: parsed.WORDPRESS_SYNC_RETRY_COUNT,
  wordpressSyncRetryDelayMs: parsed.WORDPRESS_SYNC_RETRY_DELAY_MS,
  sessionSecret: parsed.CRM_SESSION_SECRET ?? "development-session-secret",
  appBaseUrl: normalizeExternalBaseUrl(parsed.CRM_APP_BASE_URL),
  syncFreshnessSeconds: parsed.CRM_SYNC_FRESHNESS_SECONDS,
  syncFreshnessMs: parsed.CRM_SYNC_FRESHNESS_SECONDS * 1000,
  hasDatabase: Boolean(parsed.DATABASE_URL),
  hasWordPressBridge: Boolean(parsed.WORDPRESS_BASE_URL && parsed.WORDPRESS_CRM_BRIDGE_TOKEN),
  allowDevLogin: parsed.ALLOW_DEV_LOGIN === "true"
};
