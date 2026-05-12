import { NextResponse } from "next/server";

import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

export async function GET() {
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

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    databaseConfigured: config.hasDatabase,
    databaseReachable,
    schemaReady,
    databaseError,
    wordpressBridgeConfigured: config.hasWordPressBridge,
    allowDevLogin: config.allowDevLogin
  });
}
