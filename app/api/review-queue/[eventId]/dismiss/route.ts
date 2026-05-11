import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { dismissUnmatchedEvent } from "@/lib/crm";

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
  const formData = isJson ? null : await request.formData();
  const returnTo = String(formData?.get("returnTo") ?? "/review-queue");

  await dismissUnmatchedEvent(eventId);

  if (isJson) {
    return NextResponse.json({ dismissedEventId: eventId });
  }

  return NextResponse.redirect(new URL(returnTo, request.url));
}
