import { AppShell } from "@/app/components/app-shell";
import { PeopleSearch } from "@/app/components/people-search";
import { requireSession } from "@/lib/auth";
import { isPeopleSortKey, LANE_META, type LaneKey, type PeopleSortKey } from "@/lib/constants";
import { getPeople } from "@/lib/crm";

export default async function PeoplePage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; lane?: string; sort?: string }>;
}) {
  const session = await requireSession();
  const { q, lane, sort } = await searchParams;
  const initialQuery = q?.trim() ?? "";
  const initialLane = lane && lane in LANE_META ? (lane as LaneKey) : "";
  const requestedSort = sort?.trim() ?? "";
  const initialSort: PeopleSortKey = isPeopleSortKey(requestedSort) ? requestedSort : "LAST_INTERACTION";
  const contacts = await getPeople(initialQuery.length >= 3 ? initialQuery : "", {
    laneKey: initialLane || null,
    sortBy: initialSort
  });

  return (
    <AppShell currentPath="/people" session={session}>
      <PeopleSearch
        initialContacts={contacts}
        initialLane={initialLane}
        initialQuery={initialQuery}
        initialSort={initialSort}
      />
    </AppShell>
  );
}
