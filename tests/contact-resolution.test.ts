import { describe, expect, it } from "vitest";

import {
  canAutoCreateContactFromEvent,
  getAutoCreateContactDisplayName,
  requiresExistingContactForImport
} from "@/lib/sync/contact-resolution";
import type { WordPressSourceEvent } from "@/lib/types";

const baseEvent: WordPressSourceEvent = {
  externalId: "event-1",
  occurredAt: "2026-05-10T00:00:00.000Z"
};

describe("getAutoCreateContactDisplayName", () => {
  it("returns a trimmed full name when one is present", () => {
    expect(
      getAutoCreateContactDisplayName({
        ...baseEvent,
        profile: {
          fullName: "  Elena Rivera  "
        }
      })
    ).toBe("Elena Rivera");
  });

  it("returns null when the event does not include a usable full name", () => {
    expect(
      getAutoCreateContactDisplayName({
        ...baseEvent,
        profile: {
          fullName: "   "
        }
      })
    ).toBeNull();
  });
});

describe("canAutoCreateContactFromEvent", () => {
  it("returns true when both email and full name are present", () => {
    expect(
      canAutoCreateContactFromEvent({
        ...baseEvent,
        email: "elena@example.org",
        profile: {
          fullName: "Elena Rivera"
        }
      })
    ).toBe(true);
  });

  it("returns false when the email is missing", () => {
    expect(
      canAutoCreateContactFromEvent({
        ...baseEvent,
        profile: {
          fullName: "Elena Rivera"
        }
      })
    ).toBe(false);
  });

  it("returns false when the full name is missing", () => {
    expect(
      canAutoCreateContactFromEvent({
        ...baseEvent,
        email: "elena@example.org"
      })
    ).toBe(false);
  });
});

describe("requiresExistingContactForImport", () => {
  it("requires an existing contact for newsletter events", () => {
    expect(requiresExistingContactForImport("NEWSLETTER")).toBe(true);
  });

  it("does not require an existing contact for non-newsletter sources", () => {
    expect(requiresExistingContactForImport("WOOCOMMERCE")).toBe(false);
  });
});
