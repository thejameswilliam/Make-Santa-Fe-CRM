import { describe, expect, it } from "vitest";

import { buildCanonicalProfileFields } from "@/lib/profile";

describe("buildCanonicalProfileFields", () => {
  it("prefers sources using the configured priority order", () => {
    const fields = buildCanonicalProfileFields([
      {
        fieldKey: "FULL_NAME",
        source: "GRAVITY_FORMS",
        displayValue: "Elena M. Martinez",
        observedAt: "2026-02-02T00:00:00.000Z"
      },
      {
        fieldKey: "FULL_NAME",
        source: "WOOCOMMERCE",
        displayValue: "Elena Martinez",
        observedAt: "2026-05-02T00:00:00.000Z"
      }
    ]);

    const fullName = fields.find((field) => field.fieldKey === "FULL_NAME");
    expect(fullName?.displayValue).toBe("Elena Martinez");
    expect(fullName?.source).toBe("WOOCOMMERCE");
  });

  it("returns empty canonical fields when nothing has been observed yet", () => {
    const fields = buildCanonicalProfileFields([]);
    expect(fields).toHaveLength(3);
    expect(fields.every((field) => field.displayValue === null)).toBe(true);
  });
});
