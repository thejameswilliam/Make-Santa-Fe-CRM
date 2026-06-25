import { describe, expect, it } from "vitest";

import { decodeHtmlEntities, formatPhoneNumber, parseCurrencyAmountToCents } from "@/lib/utils";

describe("decodeHtmlEntities", () => {
  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("Ceramics &amp; Pottery")).toBe("Ceramics & Pottery");
  });

  it("decodes numeric entities", () => {
    expect(decodeHtmlEntities("Rock &#38; Roll &#x26; Repair")).toBe("Rock & Roll & Repair");
  });

  it("leaves plain strings unchanged", () => {
    expect(decodeHtmlEntities("Welding Studio")).toBe("Welding Studio");
  });
});

describe("parseCurrencyAmountToCents", () => {
  it("parses a plain decimal amount", () => {
    expect(parseCurrencyAmountToCents("75.00")).toBe(7500);
  });

  it("parses formatted currency strings", () => {
    expect(parseCurrencyAmountToCents("$1,250.50")).toBe(125050);
  });

  it("returns null for empty values", () => {
    expect(parseCurrencyAmountToCents("")).toBeNull();
  });

  it("returns null for invalid values", () => {
    expect(parseCurrencyAmountToCents("-5")).toBeNull();
    expect(parseCurrencyAmountToCents("abc")).toBeNull();
  });
});

describe("formatPhoneNumber", () => {
  it("formats standard 10-digit US numbers", () => {
    expect(formatPhoneNumber("5055550123")).toBe("(505) 555-0123");
  });

  it("formats 11-digit US numbers with country code", () => {
    expect(formatPhoneNumber("15055550123")).toBe("+1 (505) 555-0123");
  });

  it("leaves non-standard numbers unchanged", () => {
    expect(formatPhoneNumber("555-0123 ext 2")).toBe("555-0123 ext 2");
  });
});
