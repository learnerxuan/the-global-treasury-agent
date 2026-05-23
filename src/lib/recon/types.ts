import type { z } from "zod";
import type {
  accountIdentifierSchema,
  bankStatementTransactionSchema,
  demoFixtureSchema,
  exchangeRateInformationSchema,
  expectedPaymentRecordSchema,
  fieldEvidenceSchema,
  fileStorageRefSchema,
  inputBatchSchema,
  inputFileDescriptorSchema,
  mvpCurrencySchema,
  paymentProofExtractionOutputSchema,
  paymentProofFinancialPayloadSchema,
  paymentProofInputDescriptorSchema,
  paymentReferenceSchema,
  rawExtractedPartySchema,
  rawExtractedReferenceSchema,
  remittanceInformationSchema,
  warningCodeSchema,
  warningSchema
} from "./schemas.js";

export type CurrencyCode = z.infer<typeof mvpCurrencySchema>;
export type WarningCode = z.infer<typeof warningCodeSchema>;
export type Warning = z.infer<typeof warningSchema>;
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;
export type MoneyAmount = { value: string; currency: CurrencyCode };
export type AccountIdentifier = z.infer<typeof accountIdentifierSchema>;
export type PaymentReference = z.infer<typeof paymentReferenceSchema>;
export type RawExtractedParty = z.infer<typeof rawExtractedPartySchema>;
export type RawExtractedReference = z.infer<typeof rawExtractedReferenceSchema>;
export type RemittanceInformation = z.infer<typeof remittanceInformationSchema>;
export type ExchangeRateInformation = z.infer<typeof exchangeRateInformationSchema>;
export type DemoFixture = z.infer<typeof demoFixtureSchema>;
export type FileStorageRef = z.infer<typeof fileStorageRefSchema>;
export type InputFileDescriptor = z.infer<typeof inputFileDescriptorSchema>;
export type ExpectedPaymentRecord = z.infer<typeof expectedPaymentRecordSchema>;
export type BankStatementTransaction = z.infer<typeof bankStatementTransactionSchema>;
export type PaymentProofInputDescriptor = z.infer<typeof paymentProofInputDescriptorSchema>;
export type PaymentProofFinancialPayload = z.infer<typeof paymentProofFinancialPayloadSchema>;
export type PaymentProofExtractionOutput = z.infer<typeof paymentProofExtractionOutputSchema>;
export type InputBatch = z.infer<typeof inputBatchSchema>;
