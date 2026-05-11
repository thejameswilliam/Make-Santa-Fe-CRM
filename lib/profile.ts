import { PROFILE_SOURCE_PRIORITY, type SourceSystemKey } from "@/lib/constants";
import type { ContactProfileField, ProfileFieldKey } from "@/lib/types";

interface ProfileValueInput {
  fieldKey: ProfileFieldKey;
  source: SourceSystemKey;
  displayValue: string;
  observedAt: string;
}

export function buildCanonicalProfileFields(values: ProfileValueInput[]): ContactProfileField[] {
  const fieldKeys: ProfileFieldKey[] = ["FULL_NAME", "PHONE", "ADDRESS"];

  return fieldKeys.map((fieldKey) => {
    const rawValues = values
      .filter((value) => value.fieldKey === fieldKey)
      .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());

    const preferred = PROFILE_SOURCE_PRIORITY.map((source) =>
      rawValues.find((value) => value.source === source)
    ).find(Boolean) ?? rawValues[0] ?? null;

    return {
      fieldKey,
      displayValue: preferred?.displayValue ?? null,
      source: preferred?.source ?? null,
      rawValues
    };
  });
}
