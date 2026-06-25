import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { SOURCE_SYSTEMS, type SourceSystemKey } from "@/lib/constants";
import { ensureFreshData, getSyncActivityState, runBackfill, startBackfill } from "@/lib/sync/engine";

function parseSource(value: FormDataEntryValue | string | null): SourceSystemKey | undefined {
  if (typeof value !== "string" || value.trim().length === 0 || value === "ALL") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return SOURCE_SYSTEMS.includes(normalized as SourceSystemKey) ? (normalized as SourceSystemKey) : undefined;
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let mode = "INCREMENTAL";
  let source: SourceSystemKey | undefined;
  let returnTo = "/";
  let asyncBackfill = false;

  if (isJson) {
    const body = (await request.json()) as { mode?: string; source?: string | null; async?: boolean };
    mode = body.mode?.toUpperCase() === "BACKFILL" ? "BACKFILL" : "INCREMENTAL";
    source = parseSource(body.source ?? null);
    asyncBackfill = body.async === true;
  } else {
    const formData = await request.formData();
    mode = String(formData.get("mode") ?? "INCREMENTAL").toUpperCase() === "BACKFILL" ? "BACKFILL" : "INCREMENTAL";
    source = parseSource(formData.get("source"));
    returnTo = String(formData.get("returnTo") ?? "/");
  }

  if (isJson && asyncBackfill && mode === "BACKFILL") {
    return NextResponse.json(startBackfill(source));
  }

  const result = mode === "BACKFILL" ? await runBackfill(source) : await ensureFreshData(source);

  if (isJson) {
    return NextResponse.json(result);
  }

  return redirectFromRequest(request, returnTo);
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getSyncActivityState());
}
