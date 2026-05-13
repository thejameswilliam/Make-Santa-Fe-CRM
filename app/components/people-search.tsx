"use client";
import { useDeferredValue, useEffect, useState } from "react";

import { ContactCard } from "@/app/components/contact-card";
import { CreateContactForm } from "@/app/components/create-contact-form";
import { LANE_META, PEOPLE_SORT_OPTIONS, type LaneKey, type PeopleSortKey } from "@/lib/constants";
import type { ContactListItem } from "@/lib/types";

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

export function PeopleSearch({
  initialContacts,
  initialIncludeInactive = false,
  initialLane = "",
  initialQuery = "",
  initialSort = "LAST_INTERACTION"
}: {
  initialContacts: ContactListItem[];
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    const hasLaneFilter = laneFilter.length > 0;

    if (trimmed.length === 0 && !hasLaneFilter && sortBy === initialSort && includeInactive === initialIncludeInactive) {
      setContacts(uniqueContacts(initialContacts));
      setLoading(false);
      return;
    }

    if (trimmed.length > 0 && trimmed.length < 3 && !hasLaneFilter) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    async function loadContacts() {
      try {
        const params = new URLSearchParams();
        params.set("limit", "100");

        if (trimmed.length >= 3) {
          params.set("q", trimmed);
        }

        if (laneFilter) {
          params.set("lane", laneFilter);
        }

        if (includeInactive) {
          params.set("includeInactive", "1");
        }

        params.set("sort", sortBy);

        const response = await fetch(`/api/contacts?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { contacts: ContactListItem[] };
        setContacts(uniqueContacts(payload.contacts));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setContacts([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadContacts();

    return () => controller.abort();
  }, [deferredQuery, includeInactive, initialContacts, initialIncludeInactive, initialSort, laneFilter, sortBy]);

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
            <span className="eyebrow">{contacts.length} records</span>
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
      </section>
    </>
  );
}
