import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { mergeContacts } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { contactId } = await params;
  const formData = await request.formData();
  const mergedContactId = String(formData.get("mergedContactId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/people/${contactId}`);

  await mergeContacts(contactId, mergedContactId, session);

  return NextResponse.redirect(new URL(returnTo, request.url));
}
