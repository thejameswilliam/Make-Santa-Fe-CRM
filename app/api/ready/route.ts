import { NextResponse } from "next/server";

import { getAppHealthSummary } from "@/lib/health";

export async function GET() {
  const summary = await getAppHealthSummary();

  return NextResponse.json(summary, {
    status: summary.ready ? 200 : 503,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
