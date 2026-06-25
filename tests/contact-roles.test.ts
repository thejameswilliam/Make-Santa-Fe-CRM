import { describe, expect, it } from "vitest";

import { buildEffectiveRoleTags } from "@/lib/contact-roles";

describe("buildEffectiveRoleTags", () => {
  it("preserves manual role tags in a stable display order", () => {
    expect(
      buildEffectiveRoleTags({
        manualRoleTags: ["STAFF", "BOARD_MEMBER"],
        hasDonorHistory: false
      })
    ).toEqual(["BOARD_MEMBER", "STAFF"]);
  });

  it("adds donor as a derived effective role when donation history exists", () => {
    expect(
      buildEffectiveRoleTags({
        manualRoleTags: ["VOLUNTEER"],
        hasDonorHistory: true
      })
    ).toEqual(["VOLUNTEER", "DONOR"]);
  });

  it("returns donor by itself when there are no manual roles", () => {
    expect(
      buildEffectiveRoleTags({
        manualRoleTags: [],
        hasDonorHistory: true
      })
    ).toEqual(["DONOR"]);
  });
});
