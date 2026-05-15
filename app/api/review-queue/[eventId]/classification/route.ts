import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
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
      : redirectFromRequest(request, "/login");
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
  const manualInteractionTypeId = isJson
    ? typeof payload?.manualInteractionTypeId === "string"
      ? payload.manualInteractionTypeId
      : ""
    : String(formData?.get("manualInteractionTypeId") ?? "");
  const returnTo = String(formData?.get("returnTo") ?? "/review-queue");
  const eventType = manualInteractionTypeId ? null : findReviewEventTypeByKey(reviewEventTypeKey);

  if (!manualInteractionTypeId && !eventType) {
    return isJson
      ? NextResponse.json({ error: "Interaction type not found." }, { status: 400 })
      : redirectFromRequest(request, returnTo);
  }

  try {
    const result = await updateUnmatchedEventClassification({
      unmatchedEventId: eventId,
      reviewEventTypeKey: manualInteractionTypeId ? null : reviewEventTypeKey,
      manualInteractionTypeId: manualInteractionTypeId || null
    });

    if (isJson) {
      return NextResponse.json(result);
    }
  } catch (error) {
    if (isJson) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not update that queue item."
        },
        { status: 400 }
      );
    }
  }

  return redirectFromRequest(request, returnTo);
}
