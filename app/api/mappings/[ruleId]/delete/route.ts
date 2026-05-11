import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { deleteMappingRule } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return redirectFromRequest(request, "/login");
  }

  const { ruleId } = await params;
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") ?? "/mappings");

  try {
    await deleteMappingRule(ruleId);
  } catch {}

  return redirectFromRequest(request, returnTo);
}
