import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { isCultivationStatusKey } from "@/lib/constants";
import { updateCultivationWorkflow } from "@/lib/crm";

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ contactId: string }>;
  }
) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contactId } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    ownerUserId?: unknown;
    status?: unknown;
    nextFollowUpAt?: unknown;
  } | null;

  const ownerUserId =
    payload?.ownerUserId === undefined
      ? undefined
      : payload.ownerUserId === null
        ? null
        : typeof payload.ownerUserId === "string"
          ? payload.ownerUserId
          : undefined;

  if (payload?.ownerUserId !== undefined && ownerUserId === undefined) {
    return NextResponse.json({ error: "ownerUserId must be a string or null." }, { status: 400 });
  }

  const statusValue = payload?.status;
  const rawStatus =
    statusValue === undefined
      ? undefined
      : typeof statusValue === "string" && isCultivationStatusKey(statusValue)
        ? statusValue
        : undefined;
  if (payload?.status !== undefined && rawStatus === undefined) {
    return NextResponse.json({ error: "A valid cultivation status is required." }, { status: 400 });
  }

  const nextFollowUpAt =
    payload?.nextFollowUpAt === undefined
      ? undefined
      : payload.nextFollowUpAt === null
        ? null
        : typeof payload.nextFollowUpAt === "string"
          ? payload.nextFollowUpAt
          : undefined;

  if (payload?.nextFollowUpAt !== undefined && nextFollowUpAt === undefined) {
    return NextResponse.json({ error: "nextFollowUpAt must be a YYYY-MM-DD string or null." }, { status: 400 });
  }

  try {
    const result = await updateCultivationWorkflow({
      contactId,
      ownerUserId,
      status: rawStatus,
      nextFollowUpAt
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update cultivation workflow."
      },
      { status: 400 }
    );
  }
}
