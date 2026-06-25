import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { getRuntimeIssue, type RuntimeIssue } from "@/lib/runtime-issues";

export interface AppHealthSummary {
  ok: true;
  timestamp: string;
  databaseConfigured: boolean;
  databaseReachable: boolean;
  schemaReady: boolean;
  databaseError: string | null;
  wordpressBridgeConfigured: boolean;
  allowDevLogin: boolean;
  ready: boolean;
  readinessIssue: RuntimeIssue | null;
}

function buildReadinessIssue(summary: {
  databaseConfigured: boolean;
  databaseReachable: boolean;
  schemaReady: boolean;
  databaseError: string | null;
}) {
  if (!summary.databaseConfigured) {
    return getRuntimeIssue(new Error("DATABASE_URL is missing"), "App");
  }

  if (!summary.databaseReachable) {
    return getRuntimeIssue(new Error(summary.databaseError ?? "connection refused"), "App");
  }

  if (!summary.schemaReady) {
    return getRuntimeIssue(new Error(summary.databaseError ?? "schema check failed"), "App");
  }

  return null;
}

export async function getAppHealthSummary(): Promise<AppHealthSummary> {
  let databaseReachable = false;
  let schemaReady = false;
  let databaseError: string | null = null;

  if (prisma && config.hasDatabase) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseReachable = true;

      try {
        await prisma.sourceSyncState.count();
        schemaReady = true;
      } catch (error) {
        databaseError = error instanceof Error ? error.message.slice(0, 220) : "Schema check failed.";
      }
    } catch (error) {
      databaseError = error instanceof Error ? error.message.slice(0, 220) : "Database check failed.";
    }
  }

  const readinessIssue = buildReadinessIssue({
    databaseConfigured: config.hasDatabase,
    databaseReachable,
    schemaReady,
    databaseError
  });

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    databaseConfigured: config.hasDatabase,
    databaseReachable,
    schemaReady,
    databaseError,
    wordpressBridgeConfigured: config.hasWordPressBridge,
    allowDevLogin: config.allowDevLogin,
    ready: readinessIssue === null,
    readinessIssue
  };
}
