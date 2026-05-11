import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { deleteMappingRule } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { ruleId } = await params;
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") ?? "/mappings");

  try {
    await deleteMappingRule(ruleId);
  } catch {}

  return NextResponse.redirect(new URL(returnTo, request.url));
}
