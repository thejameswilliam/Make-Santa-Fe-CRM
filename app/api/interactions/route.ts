import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { createManualInteraction } from "@/lib/crm";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return redirectFromRequest(request, "/login");
  }

  const formData = await request.formData();
  const contactId = String(formData.get("contactId") ?? "");
  const interactionTypeId = String(formData.get("interactionTypeId") ?? "");
  const occurredAt = String(formData.get("occurredAt") ?? "");
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const amountValue = String(formData.get("amountValue") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/people/${contactId}`);

  await createManualInteraction({
    contactId,
    interactionTypeId,
    occurredAt,
    title,
    body,
    amountValue,
    actor: session
  });

  return redirectFromRequest(request, returnTo);
}
