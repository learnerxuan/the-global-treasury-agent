import * as xlsx from "xlsx";
import path from "path";

const testDir = "C:\\Users\\henge\\OneDrive\\Documents\\AI Marathon\\the-global-treasury-agent\\test_sample_1";
const bankFile = path.join(testDir, "reconpilot_maybank_statement_export_myr.xlsx");

const workbook = xlsx.readFile(bankFile);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log(data.slice(0, 10));
