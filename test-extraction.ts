import { readFile } from "fs/promises";
import { extractReconciliationDocuments } from "./src/server/input-extraction/reconciliation-workflow";
import path from "path";

async function loadEnv() {
  try {
    const envContent = await readFile(".env.local", "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...values] = line.split("=");
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join("=").trim();
      }
    }
  } catch (err) {
    // Ignore if not found
  }
}

async function main() {
  await loadEnv();
  
  const testDir = "C:\\Users\\henge\\OneDrive\\Documents\\AI Marathon\\the-global-treasury-agent\\test_sample_1";
  
  const invoiceFile = path.join(testDir, "invoice_02_RP-2026-1002.png");
  const proofFile = path.join(testDir, "payment_proof_05_customer_email_greenledger_inv1006_final.png");
  const bankFile = path.join(testDir, "maybank_myr_statement_2026-05.pdf"); // Testing the PDF!
  
  const payload = {
    invoices: [{
      fileName: "invoice_02_RP-2026-1002.png",
      mimeType: "image/png",
      contentBase64: (await readFile(invoiceFile)).toString("base64")
    }],
    bankStatements: [{
      fileName: "maybank_myr_statement_2026-05.pdf",
      mimeType: "application/pdf",
      contentBase64: (await readFile(bankFile)).toString("base64")
    }],
    paymentProofs: [{
      fileName: "payment_proof_05_customer_email_greenledger_inv1006_final.png",
      mimeType: "image/png",
      contentBase64: (await readFile(proofFile)).toString("base64")
    }]
  };

  try {
    const result = await extractReconciliationDocuments(payload);
    console.log("\n================ RAW BANK STATEMENT EXTRACTIONS ================");
    console.log(JSON.stringify(result.extractions.bank_statement, null, 2));
    
    console.log("\n================ BANK TRANSACTIONS (NORMALIZED) ================");
    console.log(JSON.stringify(result.codeTools.normalizedInputBatch.bankTransactions, null, 2));
  } catch (err) {
    console.error("Error during extraction:", err);
  }
}

main();
