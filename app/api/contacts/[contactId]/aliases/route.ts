import { NextRequest, NextResponse } from "next/server";

import { addContactAlias } from "@/lib/crm";
import { getSessionFromRequest } from "@/lib/auth";

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
  const email = String(formData.get("email") ?? "");
  const returnTo = String(formData.get("returnTo") ?? `/people/${contactId}`);

  await addContactAlias(contactId, email);

  return NextResponse.redirect(new URL(returnTo, request.url));
}
