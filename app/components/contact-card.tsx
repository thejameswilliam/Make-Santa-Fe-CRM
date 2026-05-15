"use client";

import Link from "next/link";

import { FavoriteContactButton } from "@/app/components/favorite-contact-button";
import { CONTACT_ROLE_TAG_META, LANE_META } from "@/lib/constants";
import type { ContactListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function buildInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function buildCardAccentPillStyle(color: string) {
  return {
    background: `color-mix(in srgb, ${color} 30%, rgba(6, 8, 20, 0.96))`,
    color: "#fff",
    borderColor: `color-mix(in srgb, ${color} 44%, rgba(255, 255, 255, 0.06))`
  };
}

export function ContactCard({
  contact,
  eyebrow = "Primary record",
  onFavoriteChange,
  favoriteRefreshOnSuccess = true
}: {
  contact: ContactListItem;
  eyebrow?: string;
  onFavoriteChange?: (contactId: string, isFavorite: boolean) => void;
  favoriteRefreshOnSuccess?: boolean;
}) {
  return (
    <article className={`contact-card contact-card-rich${contact.isActive ? "" : " contact-card-inactive"}`}>
      <div className="contact-card-favorite">
        <FavoriteContactButton
          className="contact-card-favorite-button"
          contactId={contact.id}
          initialIsFavorite={contact.isFavorite}
          onFavoriteChange={(isFavorite) => onFavoriteChange?.(contact.id, isFavorite)}
          refreshOnSuccess={favoriteRefreshOnSuccess}
        />
      </div>

      <Link className="contact-card-link" href={`/people/${contact.id}`}>
        <div className="contact-card-avatar-shell" aria-hidden="true">
          {contact.photoUrl ? (
            <img
              alt={contact.displayName}
              className="contact-card-avatar-image"
              loading="lazy"
              src={contact.photoUrl}
            />
          ) : (
            <div className="contact-card-avatar-fallback">{buildInitials(contact.displayName)}</div>
          )}
        </div>

        <div className="row-between contact-card-header">
          <div className="contact-meta">
            <span className="contact-eyebrow">{eyebrow}</span>
            <strong className="contact-card-name">{contact.displayName}</strong>
            <span className="muted contact-card-email">{contact.primaryEmail ?? "No primary email yet"}</span>
          </div>

          <div className="pill-row contact-card-statuses">
            {!contact.isActive ? <span className="status-pill status-pill-inactive">Inactive</span> : null}
          </div>
        </div>

        {contact.effectiveRoleTags.length > 0 ? (
          <div className="contact-card-section">
            <span className="contact-card-section-label">Role tags</span>
            <div className="pill-row contact-card-role-tags">
              {contact.effectiveRoleTags.map((roleTag) => (
                <span
                  className="role-tag-pill"
                  key={`${contact.id}-${roleTag}`}
                  style={buildCardAccentPillStyle(CONTACT_ROLE_TAG_META[roleTag].color)}
                >
                  {CONTACT_ROLE_TAG_META[roleTag].label}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="contact-card-section">
          <span className="contact-card-section-label">Interaction types</span>
          <div className="pill-row contact-card-lanes">
            {contact.recentLaneKeys.length > 0 ? (
              contact.recentLaneKeys.map((lane) => (
                <span
                  className="lane-pill"
                  key={`${contact.id}-${lane}`}
                  style={buildCardAccentPillStyle(LANE_META[lane].color)}
                >
                  {LANE_META[lane].label}
                </span>
              ))
            ) : (
              <span className="muted">No interactions yet</span>
            )}
          </div>
        </div>

        <div className="contact-card-footer">
          <span className="contact-card-section-label">Last interaction</span>
          <span className="contact-card-timestamp">
            {contact.lastInteractionAt ? formatDateTime(contact.lastInteractionAt) : "No interactions yet"}
          </span>
        </div>
      </Link>
    </article>
  );
}
