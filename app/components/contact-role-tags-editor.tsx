"use client";

import { startTransition, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  CONTACT_MANUAL_ROLE_TAGS,
  CONTACT_ROLE_TAG_META,
  type ContactEffectiveRoleTagKey,
  type ContactManualRoleTagKey
} from "@/lib/constants";

export function ContactRoleTagsEditor({
  contactId,
  manualRoleTags,
  effectiveRoleTags
}: {
  contactId: string;
  manualRoleTags: ContactManualRoleTagKey[];
  effectiveRoleTags: ContactEffectiveRoleTagKey[];
}) {
  const router = useRouter();
  const [manualTags, setManualTags] = useState<ContactManualRoleTagKey[]>(manualRoleTags);
  const [effectiveTags, setEffectiveTags] = useState<ContactEffectiveRoleTagKey[]>(effectiveRoleTags);
  const [savingTag, setSavingTag] = useState<ContactManualRoleTagKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setManualTags(manualRoleTags);
  }, [manualRoleTags]);

  useEffect(() => {
    setEffectiveTags(effectiveRoleTags);
  }, [effectiveRoleTags]);

  async function toggleRoleTag(roleTag: ContactManualRoleTagKey) {
    if (savingTag) {
      return;
    }

    const enabled = !manualTags.includes(roleTag);
    const nextManualTags = enabled
      ? [...manualTags, roleTag]
      : manualTags.filter((tag) => tag !== roleTag);

    setSavingTag(roleTag);
    setError(null);
    setManualTags(nextManualTags);

    try {
      const response = await fetch(`/api/contacts/${contactId}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roleTag,
          enabled
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            manualRoleTags?: ContactManualRoleTagKey[];
            effectiveRoleTags?: ContactEffectiveRoleTagKey[];
            error?: string;
          }
        | null;

      if (
        !response.ok ||
        !Array.isArray(payload?.manualRoleTags) ||
        !Array.isArray(payload?.effectiveRoleTags)
      ) {
        throw new Error(payload?.error ?? "Could not update role tags.");
      }

      setManualTags(payload.manualRoleTags);
      setEffectiveTags(payload.effectiveRoleTags);
      startTransition(() => {
        router.refresh();
      });
    } catch (nextError) {
      setManualTags(manualRoleTags);
      setEffectiveTags(effectiveRoleTags);
      setError(nextError instanceof Error ? nextError.message : "Could not update role tags.");
    } finally {
      setSavingTag(null);
    }
  }

  return (
    <div className="section-stack role-tag-editor">
      <div>
        <span className="eyebrow">Role tags</span>
      </div>
      <div className="pill-row role-tag-editor-row">
        {CONTACT_MANUAL_ROLE_TAGS.map((roleTag) => {
          const meta = CONTACT_ROLE_TAG_META[roleTag];
          const active = manualTags.includes(roleTag);

          return (
            <button
              className={`role-tag-pill role-tag-button${active ? " is-active" : ""}`}
              disabled={Boolean(savingTag)}
              key={roleTag}
              onClick={() => toggleRoleTag(roleTag)}
              style={{
                ["--role-tag-color" as string]: meta.color,
                ["--role-tag-text" as string]: meta.textColor
              }}
              type="button"
            >
              {meta.label}
            </button>
          );
        })}

        {effectiveTags.includes("DONOR") ? (
          <span
            className="role-tag-pill role-tag-pill-readonly"
            style={{
              background: CONTACT_ROLE_TAG_META.DONOR.color,
              color: CONTACT_ROLE_TAG_META.DONOR.textColor,
              borderColor: "transparent"
            }}
          >
            {CONTACT_ROLE_TAG_META.DONOR.label}
          </span>
        ) : null}
      </div>
      {error ? <p className="form-note">{error}</p> : null}
    </div>
  );
}
