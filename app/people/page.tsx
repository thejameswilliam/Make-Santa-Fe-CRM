import { AppShell } from "@/app/components/app-shell";
import { PeopleSearch } from "@/app/components/people-search";
import { RuntimeIssuePanel } from "@/app/components/runtime-issue-panel";
import { requireSession } from "@/lib/auth";
import { isPeopleSortKey, LANE_META, type LaneKey, type PeopleSortKey } from "@/lib/constants";
import { getPeople } from "@/lib/crm";
import { getRuntimeIssue } from "@/lib/runtime-issues";

export default async function PeoplePage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; lane?: string; sort?: string; includeInactive?: string }>;
}) {
  const session = await requireSession();
  const { q, lane, sort, includeInactive } = await searchParams;
  const initialQuery = q?.trim() ?? "";
  const initialLane = lane && lane in LANE_META ? (lane as LaneKey) : "";
  const requestedSort = sort?.trim() ?? "";
  const initialSort: PeopleSortKey = isPeopleSortKey(requestedSort) ? requestedSort : "LAST_INTERACTION";
  const initialIncludeInactive = includeInactive === "1";
  try {
    const people = await getPeople(initialQuery.length >= 3 ? initialQuery : "", {
      limit: 36,
      laneKey: initialLane || null,
      sortBy: initialSort,
      activeOnly: !initialIncludeInactive
    });

    return (
      <AppShell currentPath="/people" session={session}>
        <PeopleSearch
          initialContacts={people.contacts}
          initialHasMore={people.hasMore}
          initialIncludeInactive={initialIncludeInactive}
          initialLane={initialLane}
          initialQuery={initialQuery}
          initialSort={initialSort}
        />
      </AppShell>
    );
  } catch (error) {
    console.error("People page load failed", error);

    return (
      <AppShell currentPath="/people" session={session}>
        <RuntimeIssuePanel issue={getRuntimeIssue(error, "People page")} />
      </AppShell>
    );
  }
}
