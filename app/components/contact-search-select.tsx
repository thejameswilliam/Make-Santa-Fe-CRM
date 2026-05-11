"use client";

import { useDeferredValue, useEffect, useState } from "react";

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

export function ContactSearchSelect({
  action,
  buttonClassName = "button-secondary",
  emptyMessage = "No contacts matched this email search.",
  excludeContactId,
  formClassName = "section-stack",
  hiddenName,
  initialQuery = "",
  label,
  onSelectionChange,
  onSubmit,
  placeholder,
  returnTo,
  showSubmitButton = true,
  submitLabel,
  submitting = false
}: {
  action: string;
  buttonClassName?: string;
  emptyMessage?: string;
  excludeContactId?: string;
  formClassName?: string;
  hiddenName: "contactId" | "mergedContactId";
  initialQuery?: string;
  label: string;
  onSelectionChange?: (selectedContact: ContactListItem | null) => void;
  onSubmit?: (selectedContact: ContactListItem) => void | Promise<void>;
  placeholder: string;
  returnTo?: string;
  showSubmitButton?: boolean;
  submitLabel: string;
  submitting?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<ContactListItem[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactListItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    async function loadContacts() {
      try {
        const response = await fetch(
          `/api/contacts?mode=email&limit=12&q=${encodeURIComponent(trimmed)}${
            excludeContactId ? `&excludeContactId=${encodeURIComponent(excludeContactId)}` : ""
          }`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
          }
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { contacts: ContactListItem[] };
        setResults(uniqueContacts(payload.contacts));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadContacts();

    return () => controller.abort();
  }, [deferredQuery, excludeContactId]);

  const trimmedQuery = query.trim();

  return (
    <form
      action={action}
      className={formClassName}
      method="post"
      onSubmit={(event) => {
        if (!onSubmit) {
          return;
        }

        event.preventDefault();
        if (!selectedContact) {
          return;
        }

        void onSubmit(selectedContact);
      }}
    >
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <input name={hiddenName} type="hidden" value={selectedContact?.id ?? ""} />

      <div className="field">
        <label>
          {label}
          <input
            autoComplete="off"
            disabled={submitting}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedContact(null);
              onSelectionChange?.(null);
            }}
            placeholder={placeholder}
            type="search"
            value={query}
          />
        </label>
      </div>

      {trimmedQuery.length > 0 && trimmedQuery.length < 3 ? (
        <p className="form-note">Type at least 3 characters to search.</p>
      ) : null}

      {loading ? <p className="form-note">Searching contacts…</p> : null}

      {selectedContact ? (
        <div className="surface-row lookup-selection">
          <div className="stack-tight">
            <strong>{selectedContact.displayName}</strong>
            <span className="muted">{selectedContact.primaryEmail ?? "No primary email"}</span>
          </div>
          <button
            className="button-tertiary"
            disabled={submitting}
            onClick={() => {
              setSelectedContact(null);
              onSelectionChange?.(null);
            }}
            type="button"
          >
            Change
          </button>
        </div>
      ) : null}

      {trimmedQuery.length >= 3 && !loading && !selectedContact ? (
        <div className="lookup-results">
          {results.length === 0 ? (
            <div className="empty-state compact-empty-state">{emptyMessage}</div>
          ) : (
            results.map((contact) => (
              <button
                className="lookup-result"
                disabled={submitting}
                key={contact.id}
                onClick={() => {
                  setSelectedContact(contact);
                  onSelectionChange?.(contact);
                }}
                type="button"
              >
                <strong>{contact.displayName}</strong>
                <span className="muted">{contact.primaryEmail ?? "No primary email"}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {showSubmitButton ? (
        <button className={buttonClassName} disabled={!selectedContact || submitting} type="submit">
          {submitLabel}
        </button>
      ) : null}
    </form>
  );
}
