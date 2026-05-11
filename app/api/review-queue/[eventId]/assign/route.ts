import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { assignUnmatchedEvent } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return request.headers.get("content-type")?.includes("application/json")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
  }

  const { eventId } = await params;
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  const payload = isJson ? ((await request.json().catch(() => null)) as Record<string, unknown> | null) : null;
  const formData = isJson ? null : await request.formData();
  const returnTo = String(formData?.get("returnTo") ?? "/review-queue");
  const contactId = isJson
    ? typeof payload?.contactId === "string"
      ? payload.contactId
      : ""
    : String(formData?.get("contactId") ?? "");
  const createContact = isJson
    ? payload?.createContact === true
    : String(formData?.get("createContact") ?? "") === "true";

  const result = await assignUnmatchedEvent({
    unmatchedEventId: eventId,
    contactId: contactId || null,
    createContact
  });

  if (isJson) {
    return NextResponse.json(result);
  }

  return NextResponse.redirect(new URL(returnTo, request.url));
}
