import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { saveInteractionType } from "@/lib/crm";
import { type LaneKey } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") ?? "/mappings");

  await saveInteractionType({
    name: String(formData.get("name") ?? ""),
    laneKey: String(formData.get("laneKey") ?? "OTHER") as LaneKey
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
