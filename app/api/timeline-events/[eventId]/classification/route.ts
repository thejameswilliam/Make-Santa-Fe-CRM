import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { updateTimelineEventClassification } from "@/lib/crm";
import type { ReviewEventTypeKey } from "@/lib/constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;
  const payload = (await request.json().catch(() => null)) as { reviewEventTypeKey?: unknown } | null;
  const reviewEventTypeKey =
    typeof payload?.reviewEventTypeKey === "string" ? payload.reviewEventTypeKey : "";

  if (!reviewEventTypeKey) {
    return NextResponse.json({ error: "Interaction type is required." }, { status: 400 });
  }

  try {
    const result = await updateTimelineEventClassification({
      eventId,
      reviewEventTypeKey: reviewEventTypeKey as ReviewEventTypeKey,
      actor: session
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update the interaction type."
      },
      { status: 400 }
    );
  }
}
