import * as xlsx from "xlsx";
import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "test_sample_cross_border");

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

// 1. Generate Bank Statement (MYR) - XLSX
// Includes 3 cross-border transactions and some noise
const bankStatementData = [
  ["Date", "Description", "Reference", "Debit", "Credit", "Balance"],
  ["2026-05-01", "OPENING BALANCE", "", "", "", "500000.00"],
  ["2026-05-05", "RENT PAYMENT - MAY", "TRX-88221", "15000.00", "", "485000.00"],
  ["2026-05-18", "TELEGRAPHIC TRF - WISE", "INV-2026-999", "70845.20", "", "414154.80"],
  ["2026-05-19", "OUTWARD REMITTANCE - EUR", "BCS0042", "43605.00", "", "370549.80"],
  ["2026-05-21", "LOCAL DEPOSIT", "DEP-11", "", "20000.00", "390549.80"],
  ["2026-05-22", "PAYROLL BATCH 1", "PR-05", "120000.00", "", "270549.80"],
  ["2026-05-25", "SG TRF MERLION TECH", "INVSG881", "87500.00", "", "183049.80"],
  ["2026-05-28", "OFFICE SUPPLIES", "OS-99", "1200.00", "", "181849.80"]
];

const ws = xlsx.utils.aoa_to_sheet(bankStatementData);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Statement");
const bankFile = path.join(dir, "maybank_statement_myr_2026_05.xlsx");
xlsx.writeFile(wb, bankFile);
console.log(`Created Bank Statement: ${bankFile}`);
