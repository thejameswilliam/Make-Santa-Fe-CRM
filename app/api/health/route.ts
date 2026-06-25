import { NextResponse } from "next/server";

import { getAppHealthSummary } from "@/lib/health";

export async function GET() {
  return NextResponse.json(await getAppHealthSummary(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
