"use client";

import { startTransition, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

export function FavoriteContactButton({
  contactId,
  initialIsFavorite,
  className = "",
  title,
  refreshOnSuccess = true,
  onFavoriteChange
}: {
  contactId: string;
  initialIsFavorite: boolean;
  className?: string;
  title?: string;
  refreshOnSuccess?: boolean;
  onFavoriteChange?: (isFavorite: boolean) => void;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  async function handleToggle() {
    if (saving) {
      return;
    }

    const nextValue = !isFavorite;
    setSaving(true);
    setError(null);
    setIsFavorite(nextValue);

    try {
      const response = await fetch(`/api/contacts/${contactId}/favorite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          isFavorite: nextValue
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            isFavorite?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || typeof payload?.isFavorite !== "boolean") {
        throw new Error(payload?.error ?? "Could not update favorite state.");
      }

      setIsFavorite(payload.isFavorite);
      onFavoriteChange?.(payload.isFavorite);
      if (refreshOnSuccess) {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (nextError) {
      setIsFavorite(!nextValue);
      setError(nextError instanceof Error ? nextError.message : "Could not update favorite state.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="favorite-toggle-wrap">
      <button
        aria-label={isFavorite ? "Unfavorite person" : "Favorite person"}
        aria-pressed={isFavorite}
        className={`favorite-toggle favorite-toggle-star${isFavorite ? " is-active" : ""}${className ? ` ${className}` : ""}`}
        disabled={saving}
        onClick={handleToggle}
        title={title ?? (isFavorite ? "Unfavorite" : "Favorite")}
        type="button"
      >
        <svg
          aria-hidden="true"
          className={`favorite-toggle-star-icon${isFavorite ? " is-active" : ""}`}
          viewBox="0 0 24 24"
        >
          <path d="M12 3.75l2.79 5.66 6.24.91-4.52 4.4 1.07 6.22L12 18l-5.58 2.94 1.07-6.22-4.52-4.4 6.24-.91L12 3.75z" />
        </svg>
      </button>
      {error ? <span className="favorite-toggle-error">{error}</span> : null}
    </div>
  );
}
