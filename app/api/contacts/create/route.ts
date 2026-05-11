import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { createManualContact } from "@/lib/crm";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        displayName?: string;
        email?: string | null;
        phone?: string | null;
        address?: string | null;
      }
    | null;

  try {
    const contactId = await createManualContact({
      displayName: String(payload?.displayName ?? ""),
      email: payload?.email ?? null,
      phone: payload?.phone ?? null,
      address: payload?.address ?? null
    });

    return NextResponse.json({ contactId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not create contact."
      },
      { status: 400 }
    );
  }
}
