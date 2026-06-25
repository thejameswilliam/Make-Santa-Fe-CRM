import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { saveInteractionType } from "@/lib/crm";
import { type LaneKey } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return redirectFromRequest(request, "/login");
  }

  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") ?? "/mappings");

  await saveInteractionType({
    name: String(formData.get("name") ?? ""),
    laneKey: String(formData.get("laneKey") ?? "OTHER") as LaneKey
  });

  return redirectFromRequest(request, returnTo);
}
