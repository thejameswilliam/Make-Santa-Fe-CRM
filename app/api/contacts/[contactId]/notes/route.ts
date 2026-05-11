import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { createContactNote } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ contactId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { contactId } = await context.params;
  const formData = await request.formData();
  const content = String(formData.get("content") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/people/${contactId}`);

  await createContactNote({
    contactId,
    content,
    actor: session
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
