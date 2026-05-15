import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest, redirectFromRequest } from "@/lib/auth";
import { createManualReviewQueueItem } from "@/lib/crm";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return request.headers.get("content-type")?.includes("application/json")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : redirectFromRequest(request, "/login");
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        interactionTypeId?: string;
        occurredAt?: string;
        title?: string;
        body?: string | null;
        amountValue?: string | null;
        fullName?: string | null;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
      }
    | null;

  try {
    const item = await createManualReviewQueueItem({
      interactionTypeId: String(payload?.interactionTypeId ?? ""),
      occurredAt: String(payload?.occurredAt ?? ""),
      title: String(payload?.title ?? ""),
      body: payload?.body ?? null,
      amountValue: payload?.amountValue ?? null,
      fullName: payload?.fullName ?? null,
      email: payload?.email ?? null,
      phone: payload?.phone ?? null,
      address: payload?.address ?? null,
      actor: session
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not add that unattached interaction."
      },
      { status: 400 }
    );
  }
}
