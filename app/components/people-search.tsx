"use client";
import { useDeferredValue, useEffect, useState } from "react";

import { ContactCard } from "@/app/components/contact-card";
import { CreateContactForm } from "@/app/components/create-contact-form";
import { LANE_META, PEOPLE_SORT_OPTIONS, type LaneKey, type PeopleSortKey } from "@/lib/constants";
import type { ContactListItem } from "@/lib/types";

const PEOPLE_PAGE_SIZE = 36;
const PEOPLE_CACHE_TTL_MS = 2 * 60 * 1000;
const PEOPLE_CACHE_STORAGE_KEY = "make-santa-fe-crm:people-cache";

type PeopleCacheEntry = {
  contacts: ContactListItem[];
  hasMore: boolean;
  savedAt: number;
};

const peopleMemoryCache = new Map<string, PeopleCacheEntry>();

function uniqueContacts(items: ContactListItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function buildPeopleCacheKey(input: {
  query: string;
  laneFilter: LaneKey | "";
  sortBy: PeopleSortKey;
  includeInactive: boolean;
}) {
  return JSON.stringify({
    q: input.query.trim().toLowerCase(),
    lane: input.laneFilter,
    sort: input.sortBy,
    inactive: input.includeInactive ? 1 : 0
  });
}

function readStoredPeopleCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(PEOPLE_CACHE_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Record<string, PeopleCacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredPeopleCache(cacheKey: string, entry: PeopleCacheEntry) {
  if (typeof window === "undefined") {
    return;
  }

  peopleMemoryCache.set(cacheKey, entry);

  try {
    const current = readStoredPeopleCache() ?? {};
    current[cacheKey] = entry;
    window.sessionStorage.setItem(PEOPLE_CACHE_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore cache persistence failures.
  }
}

function readPeopleCache(cacheKey: string) {
  const memoryEntry = peopleMemoryCache.get(cacheKey);
  if (memoryEntry) {
    return memoryEntry;
  }

  const storedCache = readStoredPeopleCache();
  const storedEntry = storedCache?.[cacheKey];
  if (!storedEntry) {
    return null;
  }

  peopleMemoryCache.set(cacheKey, storedEntry);
  return storedEntry;
}

function isFreshCacheEntry(entry: PeopleCacheEntry) {
  return Date.now() - entry.savedAt <= PEOPLE_CACHE_TTL_MS;
}

async function fetchPeoplePage(input: {
  query: string;
  laneFilter: LaneKey | "";
  sortBy: PeopleSortKey;
  includeInactive: boolean;
  offset: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams();
  params.set("limit", String(PEOPLE_PAGE_SIZE));
  params.set("offset", String(input.offset));
  params.set("sort", input.sortBy);

  if (input.query.length >= 3) {
    params.set("q", input.query);
  }

  if (input.laneFilter) {
    params.set("lane", input.laneFilter);
  }

  if (input.includeInactive) {
    params.set("includeInactive", "1");
  }

  const response = await fetch(`/api/contacts?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: input.signal
  });

  if (!response.ok) {
    throw new Error("Could not load contacts.");
  }

  return (await response.json()) as {
    contacts: ContactListItem[];
    hasMore: boolean;
  };
}

export function PeopleSearch({
  initialContacts,
  initialHasMore = false,
  initialIncludeInactive = false,
  initialLane = "",
  initialQuery = "",
  initialSort = "LAST_INTERACTION"
}: {
  initialContacts: ContactListItem[];
  initialHasMore?: boolean;
  initialIncludeInactive?: boolean;
  initialLane?: LaneKey | "";
  initialQuery?: string;
  initialSort?: PeopleSortKey;
}) {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [laneFilter, setLaneFilter] = useState<LaneKey | "">(initialLane);
  const [sortBy, setSortBy] = useState<PeopleSortKey>(initialSort);
  const [includeInactive, setIncludeInactive] = useState(initialIncludeInactive);
  const [contacts, setContacts] = useState<ContactListItem[]>(() => uniqueContacts(initialContacts));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const trimmedInitialQuery = initialQuery.trim();

  useEffect(() => {
    const initialCacheKey = buildPeopleCacheKey({
      query: trimmedInitialQuery,
      laneFilter: initialLane,
      sortBy: initialSort,
      includeInactive: initialIncludeInactive
    });

    writeStoredPeopleCache(initialCacheKey, {
      contacts: uniqueContacts(initialContacts),
      hasMore: initialHasMore,
      savedAt: Date.now()
    });
  }, [
    initialContacts,
    initialHasMore,
    initialIncludeInactive,
    initialLane,
    initialSort,
    trimmedInitialQuery
  ]);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    const hasLaneFilter = laneFilter.length > 0;
    const cacheKey = buildPeopleCacheKey({
      query: trimmed,
      laneFilter,
      sortBy,
      includeInactive
    });
    const cachedEntry = readPeopleCache(cacheKey);

    if (cachedEntry) {
      setContacts(uniqueContacts(cachedEntry.contacts));
      setHasMore(cachedEntry.hasMore);

      if (isFreshCacheEntry(cachedEntry)) {
        setLoading(false);
        return;
      }
    }

    if (
      trimmed.length === 0 &&
      !hasLaneFilter &&
      sortBy === initialSort &&
      includeInactive === initialIncludeInactive
    ) {
      setContacts(uniqueContacts(initialContacts));
      setHasMore(initialHasMore);
      setLoading(false);
      return;
    }

    if (trimmed.length > 0 && trimmed.length < 3 && !hasLaneFilter) {
      setContacts([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    async function loadContacts() {
      try {
        const payload = await fetchPeoplePage({
          query: trimmed,
          laneFilter,
          sortBy,
          includeInactive,
          offset: 0,
          signal: controller.signal
        });

        const nextContacts = uniqueContacts(payload.contacts);
        setContacts(nextContacts);
        setHasMore(payload.hasMore);
        writeStoredPeopleCache(cacheKey, {
          contacts: nextContacts,
          hasMore: payload.hasMore,
          savedAt: Date.now()
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setContacts([]);
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadContacts();

    return () => controller.abort();
  }, [
    deferredQuery,
    includeInactive,
    initialContacts,
    initialHasMore,
    initialIncludeInactive,
    initialLane,
    initialSort,
    laneFilter,
    sortBy
  ]);

  async function loadMore() {
    if (loadingMore || !hasMore) {
      return;
    }

    const trimmed = deferredQuery.trim();
    const cacheKey = buildPeopleCacheKey({
      query: trimmed,
      laneFilter,
      sortBy,
      includeInactive
    });

    setLoadingMore(true);

    try {
      const payload = await fetchPeoplePage({
        query: trimmed,
        laneFilter,
        sortBy,
        includeInactive,
        offset: contacts.length
      });

      const nextContacts = uniqueContacts([...contacts, ...payload.contacts]);
      setContacts(nextContacts);
      setHasMore(payload.hasMore);
      writeStoredPeopleCache(cacheKey, {
        contacts: nextContacts,
        hasMore: payload.hasMore,
        savedAt: Date.now()
      });
    } catch {
      // Ignore load-more failures and keep current list visible.
    } finally {
      setLoadingMore(false);
    }
  }

  const trimmedQuery = query.trim();
  const showMinimumMessage = trimmedQuery.length > 0 && trimmedQuery.length < 3;

  return (
    <>
      <section className="hero-card compact-hero-card">
        <div className="people-toolbar-grid">
          <div className="section-stack">
            <span className="eyebrow">People</span>
            <div className="people-filter-bar">
              <div className="search-form">
                <input
                  autoComplete="off"
                  name="q"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or email"
                  type="search"
                  value={query}
                />
              </div>
              <div className="field people-filter-field">
                <label>
                  Interaction type
                  <select
                    aria-label="Filter people by interaction type"
                    onChange={(event) => setLaneFilter(event.target.value as LaneKey | "")}
                    value={laneFilter}
                  >
                    <option value="">All interaction types</option>
                    {Object.entries(LANE_META).map(([laneKey, lane]) => (
                      <option key={laneKey} value={laneKey}>
                        {lane.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field people-filter-field">
                <label>
                  Sort by
                  <select
                    aria-label="Sort people"
                    onChange={(event) => setSortBy(event.target.value as PeopleSortKey)}
                    value={sortBy}
                  >
                    {PEOPLE_SORT_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="people-filter-toggle">
                <input
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                  type="checkbox"
                />
                <span>Include inactive contacts</span>
              </label>
            </div>
            {showMinimumMessage ? <p className="form-note">Type at least 3 characters to add name or email search.</p> : null}
            {loading ? <p className="form-note">Searching…</p> : null}
          </div>
          <CreateContactForm />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">{hasMore ? `Showing ${contacts.length}+ people` : `${contacts.length} records`}</span>
            <h2 className="section-title">Contact list</h2>
          </div>
        </div>

        <div className="contact-list">
          {contacts.length === 0 ? (
            <div className="empty-state">
              {showMinimumMessage ? "Search starts after 3 characters." : "No contacts matched this search yet."}
            </div>
          ) : (
            contacts.map((contact) => <ContactCard contact={contact} key={contact.id} />)
          )}
        </div>

        {hasMore ? (
          <div className="people-load-more">
            <button className="button-ghost" disabled={loadingMore} onClick={() => void loadMore()} type="button">
              {loadingMore ? "Loading more…" : "Load more people"}
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
