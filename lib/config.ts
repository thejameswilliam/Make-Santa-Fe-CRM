import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  WORDPRESS_BASE_URL: z.string().optional(),
  WORDPRESS_CRM_BRIDGE_TOKEN: z.string().optional(),
  CRM_SESSION_SECRET: z.string().optional(),
  CRM_APP_BASE_URL: z.string().optional(),
  CRM_SYNC_FRESHNESS_SECONDS: z.coerce.number().default(300),
  ALLOW_DEV_LOGIN: z.enum(["true", "false"]).default("true")
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  WORDPRESS_BASE_URL: process.env.WORDPRESS_BASE_URL,
  WORDPRESS_CRM_BRIDGE_TOKEN: process.env.WORDPRESS_CRM_BRIDGE_TOKEN,
  CRM_SESSION_SECRET: process.env.CRM_SESSION_SECRET,
  CRM_APP_BASE_URL: process.env.CRM_APP_BASE_URL,
  CRM_SYNC_FRESHNESS_SECONDS: process.env.CRM_SYNC_FRESHNESS_SECONDS,
  ALLOW_DEV_LOGIN: process.env.ALLOW_DEV_LOGIN
});

export const config = {
  databaseUrl: parsed.DATABASE_URL ?? "",
  wordpressBaseUrl: parsed.WORDPRESS_BASE_URL ?? "",
  wordpressBridgeToken: parsed.WORDPRESS_CRM_BRIDGE_TOKEN ?? "",
  sessionSecret: parsed.CRM_SESSION_SECRET ?? "development-session-secret",
  appBaseUrl: parsed.CRM_APP_BASE_URL?.replace(/\/+$/, "") ?? "",
  syncFreshnessSeconds: parsed.CRM_SYNC_FRESHNESS_SECONDS,
  syncFreshnessMs: parsed.CRM_SYNC_FRESHNESS_SECONDS * 1000,
  hasDatabase: Boolean(parsed.DATABASE_URL),
  hasWordPressBridge: Boolean(parsed.WORDPRESS_BASE_URL && parsed.WORDPRESS_CRM_BRIDGE_TOKEN),
  allowDevLogin: parsed.ALLOW_DEV_LOGIN === "true"
};
