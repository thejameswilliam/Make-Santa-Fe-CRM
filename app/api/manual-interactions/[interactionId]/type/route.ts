import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { updateManualInteractionClassification } from "@/lib/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ interactionId: string }> }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { interactionId } = await params;
  const payload = (await request.json().catch(() => null)) as { interactionTypeId?: unknown } | null;
  const interactionTypeId =
    typeof payload?.interactionTypeId === "string" ? payload.interactionTypeId.trim() : "";

  if (!interactionTypeId) {
    return NextResponse.json({ error: "Interaction type is required." }, { status: 400 });
  }

  try {
    const result = await updateManualInteractionClassification({
      interactionId,
      interactionTypeId
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
