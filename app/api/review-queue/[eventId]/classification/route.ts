import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { findReviewEventTypeByKey } from "@/lib/constants";
import { updateUnmatchedEventClassification } from "@/lib/crm";
import type { ReviewEventTypeKey } from "@/lib/constants";

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
  const reviewEventTypeKey = (isJson
    ? typeof payload?.reviewEventTypeKey === "string"
      ? payload.reviewEventTypeKey
      : ""
    : String(formData?.get("reviewEventTypeKey") ?? "")) as ReviewEventTypeKey;
  const returnTo = String(formData?.get("returnTo") ?? "/review-queue");
  const eventType = findReviewEventTypeByKey(reviewEventTypeKey);

  if (!eventType) {
    return isJson
      ? NextResponse.json({ error: "Interaction type not found." }, { status: 400 })
      : NextResponse.redirect(new URL(returnTo, request.url));
  }

  await updateUnmatchedEventClassification(eventId, reviewEventTypeKey);

  if (isJson) {
    return NextResponse.json({
      reviewEventTypeKey: eventType.key,
      laneKey: eventType.laneKey,
      eventKind: eventType.eventKind
    });
  }

  return NextResponse.redirect(new URL(returnTo, request.url));
}
