import type { z } from "zod";
import type {
  accountIdentifierSchema,
  aiMetadataSchema,
  bankStatementTransactionSchema,
  exchangeRateInformationSchema,
  expectedPaymentRecordSchema,
  fieldEvidenceSchema,
  fileStorageRefSchema,
  inputBatchSchema,
  inputFileDescriptorSchema,
  mvpCurrencySchema,
  normalizedInputBatchSchema,
  normalizedPaymentProofFinancialPayloadSchema,
  normalizedPaymentProofRecordSchema,
  normalizedPartySchema,
  paymentProofExtractionOutputSchema,
  paymentProofFinancialPayloadSchema,
  paymentProofInputDescriptorSchema,
  paymentReferenceSchema,
  rawExtractedPartySchema,
  rawExtractedReferenceSchema,
  remittanceInformationSchema,
  timelineEventSchema,
  warningCodeSchema,
  warningSchema
} from "./schemas";

export type CurrencyCode = z.infer<typeof mvpCurrencySchema>;
export type WarningCode = z.infer<typeof warningCodeSchema>;
export type Warning = z.infer<typeof warningSchema>;
export type FieldEvidence = z.infer<typeof fieldEvidenceSchema>;
export type MoneyAmount = { value: string; currency: CurrencyCode };
export type AccountIdentifier = z.infer<typeof accountIdentifierSchema>;
export type PaymentReference = z.infer<typeof paymentReferenceSchema>;
export type NormalizedParty = z.infer<typeof normalizedPartySchema>;
export type RawExtractedParty = z.infer<typeof rawExtractedPartySchema>;
export type RawExtractedReference = z.infer<typeof rawExtractedReferenceSchema>;
export type RemittanceInformation = z.infer<typeof remittanceInformationSchema>;
export type ExchangeRateInformation = z.infer<typeof exchangeRateInformationSchema>;
export type FileStorageRef = z.infer<typeof fileStorageRefSchema>;
export type InputFileDescriptor = z.infer<typeof inputFileDescriptorSchema>;
export type ExpectedPaymentRecord = z.infer<typeof expectedPaymentRecordSchema>;
export type BankStatementTransaction = z.infer<typeof bankStatementTransactionSchema>;
export type PaymentProofInputDescriptor = z.infer<typeof paymentProofInputDescriptorSchema>;
export type PaymentProofFinancialPayload = z.infer<typeof paymentProofFinancialPayloadSchema>;
export type PaymentProofExtractionOutput = z.infer<typeof paymentProofExtractionOutputSchema>;
export type ProofAiMetadata = z.infer<typeof aiMetadataSchema>;
export type InputBatch = z.infer<typeof inputBatchSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type NormalizedPaymentProofFinancialPayload = z.infer<typeof normalizedPaymentProofFinancialPayloadSchema>;
export type NormalizedPaymentProofRecord = z.infer<typeof normalizedPaymentProofRecordSchema>;
export type NormalizedInputBatch = z.infer<typeof normalizedInputBatchSchema>;
