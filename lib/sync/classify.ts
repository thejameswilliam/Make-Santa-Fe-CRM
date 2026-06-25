import { LANE_META, type LaneKey, type SourceSystemKey } from "@/lib/constants";
import type { ClassificationRule, MappingHint, WordPressSourceEvent } from "@/lib/types";

interface ClassifiedEvent {
  eventKind: string;
  laneKey: LaneKey;
  title: string;
  summary: string | null;
  roleKey: string | null;
  mappingRuleId?: string | null;
}

function valueMatches(hints: MappingHint[] | undefined, matcherValue: string, acceptedTypes?: string[]) {
  const normalizedMatcher = matcherValue.trim().toLowerCase();
  return (hints ?? []).some((hint) => {
    if (acceptedTypes?.length && !acceptedTypes.includes(hint.type)) {
      return false;
    }

    return hint.value.trim().toLowerCase() === normalizedMatcher;
  });
}

export function matchesRule(event: WordPressSourceEvent, rule: ClassificationRule) {
  const matcher = rule.matcherType.trim().toUpperCase();
  const value = rule.matcherValue.trim();
  const title = event.title?.toLowerCase() ?? "";
  const summary = event.summary?.toLowerCase() ?? "";

  switch (matcher) {
    case "DEFAULT":
      return true;
    case "TAG":
      return valueMatches(event.mappingHints, value, ["tag", "event", "action", "role", "product_tag"]);
    case "CATEGORY_SLUG":
      return valueMatches(event.mappingHints, value, ["category_slug"]);
    case "FORM_ID":
      return valueMatches(event.mappingHints, value, ["form_id"]);
    case "PRODUCT_ID":
      return valueMatches(event.mappingHints, value, ["product_id"]);
    case "SKU":
      return valueMatches(event.mappingHints, value, ["sku"]);
    case "EXTERNAL_ID":
      return event.externalId.trim().toLowerCase() === value.toLowerCase();
    case "CONTAINS":
      return title.includes(value.toLowerCase()) || summary.includes(value.toLowerCase());
    default:
      return false;
  }
}

function applyTitleTemplate(template: string | null | undefined, event: WordPressSourceEvent) {
  if (!template) {
    return event.title?.trim() || "Imported interaction";
  }

  return template
    .replaceAll("{{title}}", event.title?.trim() || "Imported interaction")
    .replaceAll("{{email}}", event.email?.trim() || "unknown email")
    .replaceAll("{{externalId}}", event.externalId);
}

function fallbackClassification(source: SourceSystemKey, event: WordPressSourceEvent): ClassifiedEvent {
  switch (source) {
    case "WOOCOMMERCE":
      return {
        eventKind: "purchase",
        laneKey: "PURCHASE",
        title: event.title?.trim() || "WooCommerce activity",
        summary: event.summary?.trim() || null,
        roleKey: null
      };
    case "GRAVITY_FORMS":
      return {
        eventKind: "form_submission",
        laneKey: "OTHER",
        title: event.title?.trim() || "Form submission",
        summary: event.summary?.trim() || null,
        roleKey: null
      };
    case "SIGN_IN":
      return {
        eventKind: "sign_in",
        laneKey: "SPACE_USE",
        title: event.title?.trim() || "Sign-in",
        summary: event.summary?.trim() || null,
        roleKey: null
      };
    case "RESERVATIONS":
      return {
        eventKind: "reservation",
        laneKey: "RESERVER",
        title: event.title?.trim() || "Reservation",
        summary: event.summary?.trim() || null,
        roleKey: "reserver"
      };
    case "NEWSLETTER":
      return {
        eventKind: "email_send",
        laneKey: "EMAIL",
        title: event.title?.trim() || "Newsletter activity",
        summary: event.summary?.trim() || null,
        roleKey: null
      };
    case "MANUAL":
      return {
        eventKind: "manual_interaction",
        laneKey: "OTHER",
        title: event.title?.trim() || "Manual interaction",
        summary: event.summary?.trim() || null,
        roleKey: null
      };
  }
}

export function classifyWordPressEvent(source: SourceSystemKey, event: WordPressSourceEvent, rules: ClassificationRule[]) {
  const explicitLaneKey =
    typeof event.laneKey === "string" && Object.prototype.hasOwnProperty.call(LANE_META, event.laneKey)
      ? (event.laneKey as LaneKey)
      : null;

  if (event.eventKind?.trim() && explicitLaneKey) {
    return {
      eventKind: event.eventKind.trim(),
      laneKey: explicitLaneKey,
      title: event.title?.trim() || "Imported interaction",
      summary: event.summary?.trim() || null,
      roleKey: event.roleKey?.trim() || null,
      mappingRuleId: null
    };
  }

  const applicableRule = rules
    .filter((rule) => rule.source === source && rule.isActive !== false)
    .sort((left, right) => left.priority - right.priority)
    .find((rule) => matchesRule(event, rule));

  if (!applicableRule) {
    return fallbackClassification(source, event);
  }

  return {
    eventKind: applicableRule.eventKind,
    laneKey: applicableRule.laneKey,
    title: applyTitleTemplate(applicableRule.titleTemplate, event),
    summary: event.summary?.trim() || null,
    roleKey: applicableRule.roleKey ?? null,
    mappingRuleId: applicableRule.id ?? null
  };
}

export function laneOptions() {
  return Object.entries(LANE_META).map(([key, meta]) => ({
    key: key as LaneKey,
    label: meta.label,
    color: meta.color
  }));
}
