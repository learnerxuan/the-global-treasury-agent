import { describe, expect, it } from "vitest";
import { normalize_currency_amount, normalize_date, normalize_party_name, normalize_reference } from "./normalizers";

describe("normalize_reference", () => {
  it("strips hyphens and uppercases", () => {
    expect(normalize_reference("INV-1001")).toBe("INV1001");
  });
  it("strips slashes", () => {
    expect(normalize_reference("PO/2026/05/ABC")).toBe("PO202605ABC");
  });
  it("strips spaces", () => {
    expect(normalize_reference("INV 1001")).toBe("INV1001");
  });
  it("strips dots and other punctuation", () => {
    expect(normalize_reference("REF.2026.001")).toBe("REF2026001");
  });
  it("uppercases lowercase letters", () => {
    expect(normalize_reference("inv-1001")).toBe("INV1001");
  });
  it("returns null for null input", () => {
    expect(normalize_reference(null)).toBeNull();
  });
  it("returns null when nothing alphanumeric remains", () => {
    expect(normalize_reference("---")).toBeNull();
  });
});

describe("normalize_party_name", () => {
  it("strips Pte Ltd suffix", () => {
    expect(normalize_party_name("Acme Pte Ltd")).toBe("ACME");
  });
  it("strips Sdn Bhd suffix", () => {
    expect(normalize_party_name("ReconPilot Sdn Bhd")).toBe("RECONPILOT");
  });
  it("preserves non-suffix words", () => {
    expect(normalize_party_name("ABC Singapore")).toBe("ABC SINGAPORE");
  });
  it("strips Inc suffix", () => {
    expect(normalize_party_name("GlobalTech Inc")).toBe("GLOBALTECH");
  });
  it("strips Ltd suffix", () => {
    expect(normalize_party_name("Global Ltd")).toBe("GLOBAL");
  });
  it("strips LLC suffix", () => {
    expect(normalize_party_name("Widget LLC")).toBe("WIDGET");
  });
  it("strips Corp suffix", () => {
    expect(normalize_party_name("Delta Corp")).toBe("DELTA");
  });
  it("does not strip Corp when it is part of the company name itself", () => {
    expect(normalize_party_name("MegaCorp Corp")).toBe("MEGACORP");
  });
  it("strips Limited suffix", () => {
    expect(normalize_party_name("Delta Limited")).toBe("DELTA");
  });
  it("is case-insensitive for suffixes", () => {
    expect(normalize_party_name("Acme PTE LTD")).toBe("ACME");
  });
  it("handles punctuated suffix Pte. Ltd.", () => {
    expect(normalize_party_name("Acme Pte. Ltd.")).toBe("ACME");
  });
  it("uppercases lowercase name", () => {
    expect(normalize_party_name("acme pte ltd")).toBe("ACME");
  });
  it("returns null for null input", () => {
    expect(normalize_party_name(null)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(normalize_party_name("")).toBeNull();
  });
});

describe("normalize_date", () => {
  it("returns ISO date unchanged", () => {
    expect(normalize_date("2026-05-20")).toBe("2026-05-20");
  });
  it("extracts date from ISO datetime with timezone offset", () => {
    expect(normalize_date("2026-05-20T18:30:00+08:00")).toBe("2026-05-20");
  });
  it("extracts date from ISO datetime UTC", () => {
    expect(normalize_date("2026-05-20T00:00:00.000Z")).toBe("2026-05-20");
  });
  it("returns null for DD/MM/YYYY format", () => {
    expect(normalize_date("20/05/2026")).toBeNull();
  });
  it("returns null for MM-DD-YYYY format", () => {
    expect(normalize_date("05-20-2026")).toBeNull();
  });
  it("returns null for free-text date", () => {
    expect(normalize_date("May 20, 2026")).toBeNull();
  });
  it("returns null for null input", () => {
    expect(normalize_date(null)).toBeNull();
  });
});

describe("normalize_currency_amount", () => {
  it("strips 3-letter ISO currency code prefix", () => {
    expect(normalize_currency_amount("USD 10.00")).toBe("10.00");
  });
  it("strips MYR prefix", () => {
    expect(normalize_currency_amount("MYR 42.50")).toBe("42.50");
  });
  it("strips dollar symbol", () => {
    expect(normalize_currency_amount("$42.50")).toBe("42.50");
  });
  it("strips RM symbol", () => {
    expect(normalize_currency_amount("RM 42.50")).toBe("42.50");
  });
  it("strips S$ symbol", () => {
    expect(normalize_currency_amount("S$10.00")).toBe("10.00");
  });
  it("strips € symbol", () => {
    expect(normalize_currency_amount("€99.00")).toBe("99.00");
  });
  it("removes thousands commas", () => {
    expect(normalize_currency_amount("1,234.56")).toBe("1234.56");
  });
  it("removes multiple thousands commas", () => {
    expect(normalize_currency_amount("1,234,567.89")).toBe("1234567.89");
  });
  it("handles plain decimal string", () => {
    expect(normalize_currency_amount("100.00")).toBe("100.00");
  });
  it("handles zero", () => {
    expect(normalize_currency_amount("0.00")).toBe("0.00");
  });
  it("returns null for negative amount", () => {
    expect(normalize_currency_amount("-10.00")).toBeNull();
  });
  it("returns null for non-numeric input", () => {
    expect(normalize_currency_amount("invalid")).toBeNull();
  });
  it("returns null for null input", () => {
    expect(normalize_currency_amount(null)).toBeNull();
  });
});
