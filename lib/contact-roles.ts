import type { ContactEffectiveRoleTagKey, ContactManualRoleTagKey } from "@/lib/constants";

export function buildEffectiveRoleTags(input: {
  manualRoleTags?: readonly ContactManualRoleTagKey[] | null;
  hasDonorHistory: boolean;
}): ContactEffectiveRoleTagKey[] {
  const tags = new Set<ContactEffectiveRoleTagKey>(input.manualRoleTags ?? []);

  if (input.hasDonorHistory) {
    tags.add("DONOR");
  }

  return Array.from(tags).sort((left, right) => roleTagSortOrder(left) - roleTagSortOrder(right));
}

function roleTagSortOrder(tag: ContactEffectiveRoleTagKey) {
  switch (tag) {
    case "BOARD_MEMBER":
      return 0;
    case "INSTRUCTOR":
      return 1;
    case "VOLUNTEER":
      return 2;
    case "STAFF":
      return 3;
    case "DONOR":
      return 4;
  }
}
