import { z } from "zod";

export const schemaVersionLiteral = z.literal("1.0.0");

export const mvpCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be an uppercase ISO 4217-style 3-letter code");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Invalid ISO date");

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const reconDateSchema = z.union([isoDateSchema, isoDateTimeSchema]);

const decimalMoneyValueSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Money values must be non-negative decimal strings");

export const moneyAmountSchema = z.object({
  value: decimalMoneyValueSchema,
  currency: mvpCurrencySchema
});

export const normalizedPartySchema = z.object({
  name: z.string().nullable(),
  normalizedName: z.string().nullable()
});

export const rawExtractedPartySchema = z.object({
  rawName: z.string().nullable()
});

export const accountIdentifierSchema = z.object({
  iban: z.string().nullable(),
  swiftBic: z.string().nullable(),
  localAccountId: z.string().nullable(),
  maskedAccount: z.string().nullable()
});

export const paymentReferenceSchema = z.object({
  raw: z.string().nullable(),
  normalized: z.string().nullable()
});

export const rawExtractedReferenceSchema = z.object({
  raw: z.string().nullable()
});

export const exchangeRateInformationSchema = z.object({
  unitCurrency: mvpCurrencySchema,
  quotedCurrency: mvpCurrencySchema,
  exchangeRate: z.string().nullable(),
  rateType: z.enum(["AGREED", "SPOT", "ACTUAL", "INSTRUCTED", "IMPLIED", "UNKNOWN"]),
  source: z.enum(["payment_proof", "bank_statement", "manual", "computed_implied", "not_provided"]),
  contractId: z.string().nullable(),
  evidenceText: z.string().nullable()
});

export const warningCodeSchema = z.enum([
  "UNMAPPED_COLUMN",
  "AMBIGUOUS_COLUMN_MAPPING",
  "MISSING_REQUIRED_COLUMN",
  "INVALID_MONEY_FORMAT",
  "INVALID_DATE_FORMAT",
  "INVALID_CURRENCY",
  "MISSING_PAID_AMOUNT",
  "MISSING_PAYMENT_DATE",
  "MISSING_PAYMENT_REFERENCE",
  "MISSING_DEBTOR",
  "MISSING_CREDITOR",
  "LOW_QUALITY_PROOF",
  "LOW_CONFIDENCE_EXTRACTION",
  "PAYMENT_NOT_SETTLED",
  "IMPLIED_FX_MISSING_AMOUNTS"
]);

export const warningSchema = z.object({
  code: warningCodeSchema,
  message: z.string(),
  field: z.string().nullable()
});

export const fieldEvidenceSchema = z.object({
  field: z.string(),
  value: z.string().nullable(),
  originalValue: z.string().nullable(),
  normalizedValue: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["csv", "xlsx", "pdf_text", "pdf_table", "image_ocr", "manual"]),
  evidenceText: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  warnings: z.array(warningSchema)
});

export const remittanceInformationSchema = z.object({
  raw: z.string().nullable(),
  structured: z
    .object({
      invoiceNumber: z.string().nullable().optional(),
      creditorReference: z.string().nullable().optional(),
      additionalInfo: z.string().nullable().optional()
    })
    .nullable()
});

export const fileStorageRefSchema = z.object({
  kind: z.enum(["local_path", "object_storage", "uploaded_blob"]),
  uri: z.string(),
  sha256: z.string().nullable().optional()
});

export const inputFileDescriptorSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  fileId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  inputKind: z.enum(["expected_payment_records", "bank_statement", "payment_proof"]),
  sizeBytes: z.number().int().positive().nullable(),
  storageRef: fileStorageRefSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
  parseStatus: z.enum(["PENDING", "PARSED", "FAILED", "NEEDS_MAPPING"]),
  warnings: z.array(warningSchema)
});

export const expectedPaymentRecordSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  expectedPaymentId: z.string(),
  invoiceNumber: z.string(),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema.nullable(),
  creditor: normalizedPartySchema,
  debtor: normalizedPartySchema,
  creditorAccount: accountIdentifierSchema.nullable(),
  debtorAccount: accountIdentifierSchema.nullable(),
  invoiceCurrency: mvpCurrencySchema,
  amountDue: moneyAmountSchema,
  expectedSettlementCurrency: mvpCurrencySchema,
  paymentReference: paymentReferenceSchema,
  reconciliationStatus: z.enum(["OPEN", "MATCHED", "PARTIALLY_MATCHED", "VOID"]),
  debtorReference: paymentReferenceSchema.nullable(),
  purchaseOrderReference: paymentReferenceSchema.nullable(),
  paymentTerms: z.string().nullable(),
  outstandingAmount: moneyAmountSchema.nullable(),
  sourceFileId: z.string(),
  sourceRowNumber: z.number().int().positive().nullable(),
  fieldConfidence: z.record(z.number().min(0).max(1)),
  evidenceSpans: z.array(fieldEvidenceSchema),
  warnings: z.array(warningSchema)
});

export const bankStatementTransactionSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  internalTxId: z.string(),
  accountId: z.string(),
  bookingDate: reconDateSchema,
  valueDate: reconDateSchema.nullable(),
  creditDebitIndicator: z.enum(["CRDT", "DBIT"]),
  amount: moneyAmountSchema,
  amountReceived: moneyAmountSchema.nullable().optional(),
  sourceAmount: moneyAmountSchema.nullable().optional(),
  exchangeRateApplied: z.string().nullable().optional(),
  bankFeeDeducted: moneyAmountSchema.nullable().optional(),
  feeCurrency: mvpCurrencySchema.nullable().optional(),
  netCreditAmount: moneyAmountSchema.nullable().optional(),
  acctSvcrRef: z.string().nullable(),
  referenceNo: z.string().nullable().optional(),
  ttNo: z.string().nullable().optional(),
  normalizedReference: z.string().nullable(),
  endToEndId: z.string().nullable(),
  txId: z.string().nullable(),
  debtorName: z.string().nullable(),
  debtorNormalizedName: z.string().nullable(),
  debtorAccount: accountIdentifierSchema.nullable(),
  creditorName: z.string().nullable(),
  creditorNormalizedName: z.string().nullable(),
  creditorAccount: accountIdentifierSchema.nullable(),
  remittanceInformation: remittanceInformationSchema,
  description: z.string().nullable(),
  rawDescription: z.string().nullable(),
  remarks: z.string().nullable().optional(),
  sourceFileId: z.string(),
  sourceRowNumber: z.number().int().positive().nullable(),
  warnings: z.array(warningSchema)
});

export const paymentProofInputDescriptorSchema = inputFileDescriptorSchema.extend({
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "text/plain",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]),
  inputKind: z.literal("payment_proof"),
  textLayer: z.boolean(),
  tableLikely: z.boolean(),
  imageQuality: z.enum(["high", "medium", "low", "unknown"])
}).strict();

const paymentProofFinancialPayloadBaseSchema = z.object({
  documentType: z.enum([
    "provider_receipt",
    "bank_advice",
    "swift_confirmation",
    "remittance_advice",
    "internal_transfer_slip",
    "other"
  ]),
  paymentStatus: z.enum(["ACSC", "ACSP", "PNDG", "RJCT", "CANC", "UNKNOWN"]),
  paymentStatusLabel: z.string().nullable(),
  rawPaymentStatus: z.string().nullable(),
  debtor: rawExtractedPartySchema,
  creditor: rawExtractedPartySchema,
  debtorAccount: accountIdentifierSchema.nullable(),
  creditorAccount: accountIdentifierSchema.nullable(),
  paidAmount: moneyAmountSchema.nullable(),
  paymentDate: reconDateSchema.nullable(),
  valueDate: reconDateSchema.nullable(),
  bookingDate: reconDateSchema.nullable(),
  reference: rawExtractedReferenceSchema,
  providerTransactionId: z.string().nullable(),
  providerOrBankName: z.string().nullable(),
  invoiceIds: z.array(z.string()),
  endToEndId: z.string().nullable(),
  uetr: z.string().nullable(),
  feeAmount: moneyAmountSchema.nullable(),
  feeCurrency: mvpCurrencySchema.nullable().optional(),
  netAmount: moneyAmountSchema.nullable(),
  sourceAmount: moneyAmountSchema.nullable(),
  targetAmount: moneyAmountSchema.nullable(),
  exchangeRateInformation: exchangeRateInformationSchema.nullable(),
  remittanceInformation: remittanceInformationSchema,
  rawText: z.string().nullable()
});

export const paymentProofFinancialPayloadSchema = paymentProofFinancialPayloadBaseSchema.superRefine((payload, ctx) => {
  if (payload.exchangeRateInformation?.rateType === "IMPLIED") {
    if (!payload.sourceAmount || !payload.targetAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IMPLIED exchange rate requires sourceAmount and targetAmount",
        path: ["exchangeRateInformation"]
      });
    }
  }
});

export const aiMetadataSchema = z.object({
  extractionRoute: z.enum(["parse_pdf_text", "parse_pdf_table", "parse_csv_text", "parse_spreadsheet", "parse_image_ocr", "manual_correction"]),
  overallConfidence: z.number().min(0).max(1),
  fieldConfidence: z.record(z.number().min(0).max(1)),
  evidenceSpans: z.array(fieldEvidenceSchema),
  requiresManualReview: z.boolean(),
  warnings: z.array(warningSchema)
});

export const paymentProofExtractionOutputSchema = z
  .object({
    schemaVersion: schemaVersionLiteral,
    proofId: z.string(),
    sourceFileId: z.string(),
    financialPayload: paymentProofFinancialPayloadSchema,
    aiMetadata: aiMetadataSchema
  })
  .superRefine((output, ctx) => {
    if (output.financialPayload.paymentStatus !== "ACSC" && !output.aiMetadata.requiresManualReview) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-settled payment status requires manual review",
        path: ["aiMetadata", "requiresManualReview"]
      });
    }
  });

export const inputBatchSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  batchId: z.string(),
  uploadedAt: isoDateTimeSchema,
  files: z.array(inputFileDescriptorSchema),
  expectedPayments: z.array(expectedPaymentRecordSchema),
  bankTransactions: z.array(bankStatementTransactionSchema),
  paymentProofInputs: z.array(paymentProofInputDescriptorSchema),
  paymentProofExtractions: z.array(paymentProofExtractionOutputSchema),
  warnings: z.array(warningSchema)
});

export const timelineEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  agent: z.enum(["Extraction Agent", "Code Tools"]),
  action: z.string(),
  toolName: z.string().optional(),
  inputSummary: z.string(),
  resultSummary: z.string(),
  reasoning: z.string(),
  observedConfidence: z.number().min(0).max(1).optional(),
  warnings: z.array(warningSchema)
});

export const normalizedPaymentProofFinancialPayloadSchema = paymentProofFinancialPayloadBaseSchema
  .omit({ debtor: true, creditor: true, reference: true })
  .extend({
    debtor: normalizedPartySchema,
    creditor: normalizedPartySchema,
    reference: paymentReferenceSchema
  })
  .superRefine((payload, ctx) => {
    if (payload.exchangeRateInformation?.rateType === "IMPLIED") {
      if (!payload.sourceAmount || !payload.targetAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "IMPLIED exchange rate requires sourceAmount and targetAmount",
          path: ["exchangeRateInformation"]
        });
      }
    }
  });

export const normalizedPaymentProofRecordSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  proofId: z.string(),
  sourceFileId: z.string(),
  financialPayload: normalizedPaymentProofFinancialPayloadSchema,
  aiMetadata: aiMetadataSchema,
  normalizationMetadata: z.object({
    normalizedAt: isoDateTimeSchema,
    toolsUsed: z.array(z.enum(["normalize_party_name", "normalize_reference", "normalize_date"])),
    warnings: z.array(warningSchema)
  })
});

export const normalizedInputBatchSchema = z.object({
  schemaVersion: schemaVersionLiteral,
  batchId: z.string(),
  uploadedAt: isoDateTimeSchema,
  expectedPayments: z.array(expectedPaymentRecordSchema),
  bankTransactions: z.array(bankStatementTransactionSchema),
  paymentProofs: z.array(normalizedPaymentProofRecordSchema),
  warnings: z.array(warningSchema),
  timelines: z.array(timelineEventSchema)
});
