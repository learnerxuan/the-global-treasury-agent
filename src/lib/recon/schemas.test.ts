import { describe, expect, it } from "vitest";
import {
  bankStatementTransactionSchema,
  expectedPaymentRecordSchema,
  inputBatchSchema,
  inputFileDescriptorSchema,
  paymentProofExtractionOutputSchema,
  paymentProofInputDescriptorSchema
} from "./schemas.js";
import {
  bankStatementFixture,
  expectedPaymentFixture,
  inputBatchFixture,
  paymentProofExtractionFixture,
  paymentProofInputFixture
} from "./fixtures/input-batch.js";

describe("Block 1 schemas", () => {
  it("validates the expected payment, bank transaction, proof input, proof extraction, and input batch fixtures", () => {
    expect(expectedPaymentRecordSchema.safeParse(expectedPaymentFixture).success).toBe(true);
    expect(bankStatementTransactionSchema.safeParse(bankStatementFixture).success).toBe(true);
    expect(paymentProofInputDescriptorSchema.safeParse(paymentProofInputFixture).success).toBe(true);
    expect(paymentProofExtractionOutputSchema.safeParse(paymentProofExtractionFixture).success).toBe(true);
    expect(inputBatchSchema.safeParse(inputBatchFixture).success).toBe(true);
  });

  it("validates a general input file descriptor with storageRef", () => {
    const result = inputFileDescriptorSchema.safeParse(inputBatchFixture.files[0]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageRef?.kind).toBe("local_path");
    }
  });

  it("rejects lowercase and unsupported currencies", () => {
    expect(
      expectedPaymentRecordSchema.safeParse({
        ...expectedPaymentFixture,
        invoiceCurrency: "usd"
      }).success
    ).toBe(false);

    expect(
      expectedPaymentRecordSchema.safeParse({
        ...expectedPaymentFixture,
        invoiceCurrency: "JPY"
      }).success
    ).toBe(false);
  });

  it("rejects invalid dates and negative money", () => {
    expect(
      expectedPaymentRecordSchema.safeParse({
        ...expectedPaymentFixture,
        issueDate: "2026-02-31"
      }).success
    ).toBe(false);

    expect(
      expectedPaymentRecordSchema.safeParse({
        ...expectedPaymentFixture,
        amountDue: { value: "-10.00", currency: "USD" }
      }).success
    ).toBe(false);
  });

  it("allows missing raw proof reference but keeps warning support", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...paymentProofExtractionFixture,
      financialPayload: {
        ...paymentProofExtractionFixture.financialPayload,
        reference: { raw: null }
      },
      aiMetadata: {
        ...paymentProofExtractionFixture.aiMetadata,
        warnings: [
          {
            code: "MISSING_PAYMENT_REFERENCE",
            message: "No payment reference was found in the proof.",
            field: "financialPayload.reference.raw"
          }
        ]
      }
    });
    expect(result.success).toBe(true);
  });

  it("requires implied FX to include source and target amounts", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...paymentProofExtractionFixture,
      financialPayload: {
        ...paymentProofExtractionFixture.financialPayload,
        sourceAmount: null,
        targetAmount: null,
        exchangeRateInformation: {
          unitCurrency: "USD",
          quotedCurrency: "MYR",
          exchangeRate: "4.2500",
          rateType: "IMPLIED",
          source: "computed_implied",
          contractId: null,
          evidenceText: "Computed from sourceAmount USD 10.00 and targetAmount MYR 42.50"
        }
      }
    });
    expect(result.success).toBe(false);
  });

  it("requires manual review when payment status is not settled", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...paymentProofExtractionFixture,
      financialPayload: {
        ...paymentProofExtractionFixture.financialPayload,
        paymentStatus: "PNDG"
      },
      aiMetadata: {
        ...paymentProofExtractionFixture.aiMetadata,
        requiresManualReview: false
      }
    });
    expect(result.success).toBe(false);
  });

  it("keeps Agent 1 proof fields raw before Block 3 normalization", () => {
    const serialized = JSON.stringify(paymentProofExtractionFixture);
    expect(serialized).toContain("\"debtor\":{\"rawName\"");
    expect(serialized).toContain("\"reference\":{\"raw\"");
    expect(serialized).not.toContain("normalizedName");
    expect(serialized).not.toContain("\"normalized\"");
  });
});
