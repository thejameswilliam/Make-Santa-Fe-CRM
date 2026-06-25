import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { updateManualInteraction } from "@/lib/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ interactionId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { interactionId } = await params;
  const payload = (await request.json().catch(() => null)) as {
    interactionTypeId?: unknown;
    occurredAt?: unknown;
    title?: unknown;
    body?: unknown;
    amountValue?: unknown;
  } | null;

  const interactionTypeId =
    typeof payload?.interactionTypeId === "string" ? payload.interactionTypeId.trim() : "";
  const occurredAt =
    typeof payload?.occurredAt === "string" ? payload.occurredAt.trim() : "";
  const title =
    typeof payload?.title === "string" ? payload.title : "";
  const body =
    typeof payload?.body === "string" ? payload.body : "";
  const amountValue =
    typeof payload?.amountValue === "string" ? payload.amountValue : "";

  if (!interactionTypeId) {
    return NextResponse.json({ error: "Interaction type is required." }, { status: 400 });
  }

  if (!occurredAt) {
    return NextResponse.json({ error: "Date and time are required." }, { status: 400 });
  }

  if (!title.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  try {
    const result = await updateManualInteraction({
      interactionId,
      interactionTypeId,
      occurredAt,
      title,
      body,
      amountValue,
      actor: session
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update the manual interaction."
      },
      { status: 400 }
    );
  }
}
