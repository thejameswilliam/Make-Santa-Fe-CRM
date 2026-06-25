"use client";

import { startTransition, useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

export function CreateContactForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/contacts/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName,
          email,
          phone,
          address
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            contactId?: string;
            error?: string;
          }
        | null;

      if (!response.ok || typeof payload?.contactId !== "string") {
        throw new Error(payload?.error ?? "Could not create contact.");
      }

      startTransition(() => {
        router.push(`/people/${payload.contactId}`);
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface-row create-contact-panel">
      <div className="section-stack">
        <div>
          <span className="eyebrow">Manual</span>
          <h2 className="section-title">Add contact</h2>
        </div>
        <p className="form-note">Use for cash/check donors and anyone who is not coming in through an imported system.</p>
      </div>

      <form className="create-contact-form" onSubmit={handleSubmit}>
        <div className="field-grid">
          <div className="field">
            <label>
              Full name
              <input
                autoComplete="name"
                name="displayName"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Pat Example"
                required
                value={displayName}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Email
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="pat@example.org"
                type="email"
                value={email}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Phone
              <input
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="505-555-1234"
                value={phone}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Address
              <input
                autoComplete="street-address"
                name="address"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="123 Example St, Santa Fe, NM"
                value={address}
              />
            </label>
          </div>
        </div>

        {error ? <div className="inline-alert inline-alert-error">{error}</div> : null}

        <div className="create-contact-actions">
          <span className="form-note">Email is optional. The person record can exist before any digital history does.</span>
          <button className="button-secondary" disabled={saving || !displayName.trim()} type="submit">
            {saving ? "Saving..." : "Create contact"}
          </button>
        </div>
      </form>
    </div>
  );
}
