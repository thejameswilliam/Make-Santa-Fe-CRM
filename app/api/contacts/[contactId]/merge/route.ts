import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { mergeContacts } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return redirectFromRequest(request, "/login");
  }

  const { contactId } = await params;
  const formData = await request.formData();
  const mergedContactId = String(formData.get("mergedContactId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/people/${contactId}`);

  await mergeContacts(contactId, mergedContactId, session);

  return redirectFromRequest(request, returnTo);
}
