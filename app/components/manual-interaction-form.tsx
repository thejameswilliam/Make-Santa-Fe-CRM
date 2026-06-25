"use client";

import { useMemo, useState } from "react";

import { getCurrentDateTimeInputValue } from "@/lib/utils";

interface InteractionTypeOption {
  id: string;
  name: string;
  slug: string;
  laneKey: string;
}

export function ManualInteractionForm({
  contactId,
  interactionTypeOptions,
  returnTo
}: {
  contactId: string;
  interactionTypeOptions: InteractionTypeOption[];
  returnTo: string;
}) {
  const [interactionTypeId, setInteractionTypeId] = useState(
    interactionTypeOptions.find((option) => option.slug === "general-note")?.id ?? interactionTypeOptions[0]?.id ?? ""
  );

  const selectedType = useMemo(
    () => interactionTypeOptions.find((option) => option.id === interactionTypeId) ?? interactionTypeOptions[0] ?? null,
    [interactionTypeId, interactionTypeOptions]
  );

  const showDonationAmount = selectedType?.slug === "donation";
  const titlePlaceholder =
    selectedType?.slug === "donation"
      ? "Cash donation at front desk"
      : selectedType?.slug === "membership_complimentary"
        ? "Complimentary membership granted"
        : selectedType?.slug?.startsWith("membership_")
          ? "Membership status updated"
          : "Volunteer orientation attended";

  return (
    <form action="/api/interactions" className="section-stack" method="post">
      <input name="contactId" type="hidden" value={contactId} />
      <input name="returnTo" type="hidden" value={returnTo} />

      <div className="field">
        <label>
          Interaction type
          <select
            name="interactionTypeId"
            onChange={(event) => setInteractionTypeId(event.target.value)}
            required
            value={interactionTypeId}
          >
            {interactionTypeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showDonationAmount ? (
        <div className="field">
          <label>
            Donation amount
            <input
              inputMode="decimal"
              min="0"
              name="amountValue"
              placeholder="75.00"
              required
              step="0.01"
              type="number"
            />
          </label>
        </div>
      ) : null}

      <div className="field">
        <label>
          Date and time
          <input
            defaultValue={getCurrentDateTimeInputValue()}
            name="occurredAt"
            required
            type="datetime-local"
          />
        </label>
      </div>

      <div className="field">
        <label>
          Title
          <input
            name="title"
            placeholder={titlePlaceholder}
            required
          />
        </label>
      </div>

      <div className="field">
        <label>
          Details
          <textarea name="body" placeholder="Add the context staff should see later." />
        </label>
      </div>

      <button className="button-secondary" type="submit">
        Save interaction
      </button>
    </form>
  );
}
