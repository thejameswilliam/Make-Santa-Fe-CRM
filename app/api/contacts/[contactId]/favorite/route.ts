import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { setContactFavorite } from "@/lib/crm";

export async function POST(
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
  const payload = (await request.json().catch(() => null)) as { isFavorite?: unknown } | null;

  if (typeof payload?.isFavorite !== "boolean") {
    return NextResponse.json({ error: "A boolean isFavorite value is required." }, { status: 400 });
  }

  try {
    const result = await setContactFavorite({
      contactId,
      isFavorite: payload.isFavorite
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update favorite state."
      },
      { status: 400 }
    );
  }
}
