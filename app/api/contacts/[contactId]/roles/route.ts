import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { isContactManualRoleTagKey } from "@/lib/constants";
import { setContactManualRoleTag } from "@/lib/crm";

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
  const payload = (await request.json().catch(() => null)) as {
    roleTag?: unknown;
    enabled?: unknown;
  } | null;

  const rawRoleTag = typeof payload?.roleTag === "string" ? payload.roleTag : null;
  if (!isContactManualRoleTagKey(rawRoleTag)) {
    return NextResponse.json({ error: "A valid manual roleTag value is required." }, { status: 400 });
  }

  const enabled = payload?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "A boolean enabled value is required." }, { status: 400 });
  }

  try {
    const result = await setContactManualRoleTag({
      contactId,
      roleTag: rawRoleTag,
      enabled
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update role tags."
      },
      { status: 400 }
    );
  }
}
