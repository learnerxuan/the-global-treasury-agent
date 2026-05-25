import { describe, expect, it } from "vitest";
import {
  computeImpliedFx,
  extractDate,
  extractFxRate,
  extractInvoiceIds,
  extractMoney,
  extractPaymentStatus,
  extractRemittanceLineItems,
  tableToText
} from "./extract-payment-fields";

describe("extract-payment-fields", () => {
  it("extracts decimal-string money", () => {
    expect(extractMoney("Paid USD 10.00 to beneficiary")).toEqual({
      value: "10.00",
      currency: "USD",
      original: "USD 10.00"
    });
  });

  it("extracts dates, invoice IDs, settled status, and explicit FX", () => {
    const text = "Paid USD 10.00 Reference INV-1001 Exchange rate: 1 USD = 4.2500 MYR Date 2026-05-20";
    expect(extractDate(text)).toBe("2026-05-20");
    expect(extractInvoiceIds(`${text} INV-1001`)).toEqual(["INV-1001"]);
    expect(extractPaymentStatus("Status: Completed").paymentStatus).toBe("ACSC");
    expect(extractFxRate(text)).toMatchObject({
      unitCurrency: "USD",
      quotedCurrency: "MYR",
      exchangeRate: "4.2500",
      rateType: "AGREED"
    });
  });

  it("computes implied FX only when source and target amounts exist", () => {
    expect(computeImpliedFx({ value: "10.00", currency: "USD" }, { value: "42.50", currency: "MYR" })).toMatchObject({
      exchangeRate: "4.2500",
      rateType: "IMPLIED",
      source: "computed_implied"
    });
    expect(computeImpliedFx(null, { value: "42.50", currency: "MYR" })).toBeNull();
  });

  it("flattens table rows into searchable text", () => {
    expect(tableToText([["payer", "Beta Exports Ltd"]])).toBe("payer: Beta Exports Ltd");
  });

  it("extracts multiple remittance invoice lines with paid amounts", () => {
    const text = [
      "Invoice IDs",
      "INV-B1 MYR 100.00 settled",
      "INV-2026-1007 MYR 250.00 settled",
      "RCN-1010 USD 75.50 settled"
    ].join("\n");

    expect(extractInvoiceIds(text)).toEqual(["INV-B1", "INV-2026-1007", "RCN-1010"]);
    expect(extractRemittanceLineItems(text).map((item) => [item.invoiceNumber, item.paidAmount])).toEqual([
      ["INV-B1", { value: "100.00", currency: "MYR" }],
      ["INV-2026-1007", { value: "250.00", currency: "MYR" }],
      ["RCN-1010", { value: "75.50", currency: "USD" }]
    ]);
  });
});
