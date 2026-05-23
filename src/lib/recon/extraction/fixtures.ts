import type { ExtractionRoute } from "./tools.js";
import type { PaymentProofInputDescriptor } from "../types.js";

export type ProofToolFixture = {
  expectedRoute: ExtractionRoute;
  descriptor: PaymentProofInputDescriptor;
};

const uploadedAt = "2026-05-23T18:31:00+08:00";

export const proofToolFixtures: ProofToolFixture[] = [
  {
    expectedRoute: "parse_pdf_text",
    descriptor: {
      schemaVersion: "1.0.0",
      fileId: "proof_file_001",
      fileName: "wise-transfer-inv-1001.pdf",
      mimeType: "application/pdf",
      inputKind: "payment_proof",
      sizeBytes: 2400,
      storageRef: {
        kind: "local_path",
        uri: "src/lib/recon/fixtures/proofs/wise-transfer-inv-1001.pdf",
        sha256: null
      },
      uploadedAt,
      parseStatus: "PENDING",
      textLayer: true,
      tableLikely: false,
      imageQuality: "high",
      demoFixture: {
        rawText:
          "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20. Status: Paid. Payer: Acme Pte Ltd. Transaction ID: WISE-TRX-88291.",
        rawTable: null,
        rawOcr: null
      },
      warnings: []
    }
  },
  {
    expectedRoute: "parse_pdf_table",
    descriptor: {
      schemaVersion: "1.0.0",
      fileId: "proof_file_002",
      fileName: "bank-advice-inv-1002.pdf",
      mimeType: "application/pdf",
      inputKind: "payment_proof",
      sizeBytes: 2800,
      storageRef: {
        kind: "local_path",
        uri: "src/lib/recon/fixtures/proofs/bank-advice-inv-1002.pdf",
        sha256: null
      },
      uploadedAt,
      parseStatus: "PENDING",
      textLayer: true,
      tableLikely: true,
      imageQuality: "high",
      demoFixture: {
        rawText: null,
        rawTable: [
          ["payer", "Beta Exports Ltd"],
          ["beneficiary", "ReconPilot Sdn Bhd"],
          ["amount", "SGD 250.00"],
          ["target amount", "MYR 875.00"],
          ["reference", "INV-1002"],
          ["payment date", "2026-05-21"],
          ["status", "Completed"],
          ["bank", "DBS"]
        ],
        rawOcr: null
      },
      warnings: []
    }
  },
  {
    expectedRoute: "parse_image_ocr",
    descriptor: {
      schemaVersion: "1.0.0",
      fileId: "proof_file_003",
      fileName: "scanned-slip-inv-1003.png",
      mimeType: "image/png",
      inputKind: "payment_proof",
      sizeBytes: 3200,
      storageRef: {
        kind: "local_path",
        uri: "src/lib/recon/fixtures/proofs/scanned-slip-inv-1003.png",
        sha256: null
      },
      uploadedAt,
      parseStatus: "PENDING",
      textLayer: false,
      tableLikely: false,
      imageQuality: "medium",
      demoFixture: {
        rawText: null,
        rawTable: null,
        rawOcr:
          "TRANSFER RECEIPT PAID USD 200.00 REF INV-1003 DATE 2026-05-22 SENDER Gamma Trading BENEFICIARY ReconPilot"
      },
      warnings: []
    }
  },
  {
    expectedRoute: "manual_correction",
    descriptor: {
      schemaVersion: "1.0.0",
      fileId: "proof_file_004",
      fileName: "blurred-proof-unknown.jpg",
      mimeType: "image/jpeg",
      inputKind: "payment_proof",
      sizeBytes: 2100,
      storageRef: {
        kind: "local_path",
        uri: "src/lib/recon/fixtures/proofs/blurred-proof-unknown.jpg",
        sha256: null
      },
      uploadedAt,
      parseStatus: "PENDING",
      textLayer: false,
      tableLikely: false,
      imageQuality: "low",
      demoFixture: {
        rawText: null,
        rawTable: null,
        rawOcr: null
      },
      warnings: []
    }
  }
];
