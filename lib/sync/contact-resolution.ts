import type { SourceSystemKey } from "@/lib/constants";
import type { WordPressSourceEvent } from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";

export function getAutoCreateContactDisplayName(event: WordPressSourceEvent) {
  const fullName = event.profile?.fullName?.trim();
  return fullName ? fullName : null;
}

export function canAutoCreateContactFromEvent(event: WordPressSourceEvent) {
  return Boolean(normalizeEmail(event.email) && getAutoCreateContactDisplayName(event));
}

export function requiresExistingContactForImport(source: SourceSystemKey) {
  return source === "NEWSLETTER";
}
