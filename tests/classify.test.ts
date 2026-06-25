import { describe, expect, it } from "vitest";

import { classifyWordPressEvent, matchesRule } from "@/lib/sync/classify";
import type { ClassificationRule, WordPressSourceEvent } from "@/lib/types";

const donationRule: ClassificationRule = {
  source: "WOOCOMMERCE",
  name: "Donation Products",
  matcherType: "TAG",
  matcherValue: "donation",
  eventKind: "donation",
  laneKey: "DONOR",
  priority: 10
};

const baseEvent: WordPressSourceEvent = {
  externalId: "wc-order-123",
  occurredAt: "2026-05-01T00:00:00.000Z",
  email: "donor@example.org",
  title: "WooCommerce order #123",
  mappingHints: [
    { type: "tag", value: "donation" }
  ]
};

describe("matchesRule", () => {
  it("matches tag-based rules using source hints", () => {
    expect(matchesRule(baseEvent, donationRule)).toBe(true);
  });

  it("does not match when the mapping hint differs", () => {
    expect(
      matchesRule(
        {
          ...baseEvent,
          mappingHints: [{ type: "tag", value: "membership" }]
        },
        donationRule
      )
    ).toBe(false);
  });

  it("matches WooCommerce category slug rules against category hints", () => {
    expect(
      matchesRule(
        {
          ...baseEvent,
          mappingHints: [{ type: "category_slug", value: "memberships" }]
        },
        {
          source: "WOOCOMMERCE",
          name: "Membership category",
          matcherType: "CATEGORY_SLUG",
          matcherValue: "memberships",
          eventKind: "membership_payment",
          laneKey: "MEMBER",
          priority: 10
        }
      )
    ).toBe(true);
  });
});

describe("classifyWordPressEvent", () => {
  it("prefers explicit bridge classifications over CRM-side rules", () => {
    const classification = classifyWordPressEvent(
      "WOOCOMMERCE",
      {
        ...baseEvent,
        eventKind: "membership_active",
        laneKey: "MEMBER",
        roleKey: "member",
        title: "Membership activated"
      },
      [donationRule]
    );

    expect(classification.eventKind).toBe("membership_active");
    expect(classification.laneKey).toBe("MEMBER");
    expect(classification.roleKey).toBe("member");
    expect(classification.mappingRuleId).toBeNull();
  });

  it("preserves explicit Gravity Forms donation classifications from the bridge", () => {
    const classification = classifyWordPressEvent(
      "GRAVITY_FORMS",
      {
        externalId: "gf-entry-12",
        occurredAt: "2026-05-01T00:00:00.000Z",
        email: "donor@example.org",
        title: "Donation via Spring Campaign",
        amountCents: 5000,
        eventKind: "donation",
        laneKey: "DONOR",
        roleKey: "donor"
      },
      []
    );

    expect(classification.eventKind).toBe("donation");
    expect(classification.laneKey).toBe("DONOR");
    expect(classification.roleKey).toBe("donor");
    expect(classification.mappingRuleId).toBeNull();
  });

  it("preserves explicit newsletter click classifications from the bridge", () => {
    const classification = classifyWordPressEvent(
      "NEWSLETTER",
      {
        externalId: "newsletter-click-44-12",
        occurredAt: "2026-05-03T18:22:00.000Z",
        email: "member@example.org",
        title: "Clicked: May newsletter",
        eventKind: "email_click",
        laneKey: "EMAIL"
      },
      []
    );

    expect(classification.eventKind).toBe("email_click");
    expect(classification.laneKey).toBe("EMAIL");
    expect(classification.mappingRuleId).toBeNull();
  });

  it("preserves explicit volunteer orientation classifications from the bridge", () => {
    const classification = classifyWordPressEvent(
      "SIGN_IN",
      {
        externalId: "volunteer-orientation-33",
        occurredAt: "2026-04-12T16:00:00.000Z",
        email: "volunteer@example.org",
        title: "Volunteer orientation completed",
        eventKind: "volunteer_orientation_completed",
        laneKey: "VOLUNTEER",
        roleKey: "volunteer"
      },
      []
    );

    expect(classification.eventKind).toBe("volunteer_orientation_completed");
    expect(classification.laneKey).toBe("VOLUNTEER");
    expect(classification.roleKey).toBe("volunteer");
    expect(classification.mappingRuleId).toBeNull();
  });

  it("returns the first matching rule by priority", () => {
    const classification = classifyWordPressEvent("WOOCOMMERCE", baseEvent, [
      {
        ...donationRule,
        priority: 20
      },
      {
        ...donationRule,
        id: "rule-high-priority",
        matcherValue: "donation",
        eventKind: "donation",
        laneKey: "DONOR",
        priority: 5
      }
    ]);

    expect(classification.eventKind).toBe("donation");
    expect(classification.laneKey).toBe("DONOR");
    expect(classification.mappingRuleId).toBe("rule-high-priority");
  });

  it("falls back to a sensible source default when no rules match", () => {
    const classification = classifyWordPressEvent(
      "SIGN_IN",
      {
        externalId: "signin-1",
        occurredAt: "2026-05-01T00:00:00.000Z",
        title: "Front desk sign-in"
      },
      []
    );

    expect(classification.eventKind).toBe("sign_in");
    expect(classification.laneKey).toBe("SPACE_USE");
  });

  it("falls back to newsletter send events when the bridge does not provide explicit mapping", () => {
    const classification = classifyWordPressEvent(
      "NEWSLETTER",
      {
        externalId: "newsletter-send-44-12",
        occurredAt: "2026-05-01T00:00:00.000Z",
        email: "member@example.org",
        title: "May newsletter"
      },
      []
    );

    expect(classification.eventKind).toBe("email_send");
    expect(classification.laneKey).toBe("EMAIL");
  });
});
