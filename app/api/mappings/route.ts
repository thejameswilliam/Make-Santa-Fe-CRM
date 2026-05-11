import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { saveMappingRule } from "@/lib/crm";
import { parseOptionalNumber } from "@/lib/utils";
import { type LaneKey, type SourceSystemKey } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return redirectFromRequest(request, "/login");
  }

  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") ?? "/mappings");

  await saveMappingRule({
    name: String(formData.get("name") ?? ""),
    source: String(formData.get("source") ?? "WOOCOMMERCE") as SourceSystemKey,
    matcherType: String(formData.get("matcherType") ?? "DEFAULT"),
    matcherValue: String(formData.get("matcherValue") ?? "*"),
    eventKind: String(formData.get("eventKind") ?? "imported_interaction"),
    laneKey: String(formData.get("laneKey") ?? "OTHER") as LaneKey,
    priority: parseOptionalNumber(formData.get("priority")) ?? 100
  });

  return redirectFromRequest(request, returnTo);
}
