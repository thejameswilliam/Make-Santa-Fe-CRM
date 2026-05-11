import { NextResponse } from "next/server";

import { config } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    databaseConfigured: config.hasDatabase,
    wordpressBridgeConfigured: config.hasWordPressBridge,
    allowDevLogin: config.allowDevLogin
  });
}
