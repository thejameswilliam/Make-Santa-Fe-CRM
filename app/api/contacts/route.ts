import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { isPeopleSortKey, LANE_META, type LaneKey } from "@/lib/constants";
import { getPeople } from "@/lib/crm";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const excludeContactId = searchParams.get("excludeContactId")?.trim() ?? "";
  const mode = searchParams.get("mode") === "email" ? "email" : "all";
  const requestedLane = searchParams.get("lane")?.trim() ?? "";
  const laneKey = requestedLane && requestedLane in LANE_META ? (requestedLane as LaneKey) : null;
  const requestedSort = searchParams.get("sort")?.trim() ?? "";
  const sortBy = isPeopleSortKey(requestedSort) ? requestedSort : "LAST_INTERACTION";
  const includeInactive = searchParams.get("includeInactive") === "1";
  const requestedOffset = Number(searchParams.get("offset") ?? "0");
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, requestedOffset)
    : 0;
  const requestedLimit = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100))
    : 20;

  if (query.length > 0 && query.length < 3) {
    return NextResponse.json({ contacts: [], hasMore: false });
  }

  const people = await getPeople(query, {
    limit,
    offset,
    excludeContactId: excludeContactId || null,
    searchMode: mode,
    laneKey,
    sortBy,
    activeOnly: !includeInactive && mode !== "email"
  });

  return NextResponse.json(people);
}
