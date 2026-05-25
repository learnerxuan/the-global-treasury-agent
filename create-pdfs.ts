import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "test_sample_cross_border");
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

function createInvoice(filename: string, fromName: string, fromAddress: string, toName: string, toAddress: string, invNum: string, date: string, desc: string, amount: string) {
  const doc = new PDFDocument({ margin: 50 });
  const invoicePath = path.join(dir, filename);
  doc.pipe(fs.createWriteStream(invoicePath));

  doc.fontSize(20).text("INVOICE", { align: "right" });
  doc.moveDown();

  doc.fontSize(10).text("From:", 50, 100);
  doc.fontSize(12).text(fromName, 50, 115);
  doc.fontSize(10).text(fromAddress);

  doc.text("To:", 300, 100);
  doc.fontSize(12).text(toName, 300, 115);
  doc.fontSize(10).text(toAddress);

  doc.moveDown(3);
  doc.text(`Invoice Number: ${invNum}`, 50, 200);
  doc.text(`Invoice Date: ${date}`);
  
  doc.moveDown(2);
  const tableTop = 270;
  doc.text("Description", 50, tableTop, { bold: true });
  doc.text("Amount", 400, tableTop, { bold: true });
  
  doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();
  
  doc.text(desc, 50, tableTop + 30);
  doc.text(amount, 400, tableTop + 30);

  doc.moveTo(50, tableTop + 60).lineTo(500, tableTop + 60).stroke();

  doc.fontSize(12).text("TOTAL DUE:", 250, tableTop + 80, { bold: true, align: "right" });
  doc.text(amount, 400, tableTop + 80, { bold: true });

  doc.end();
  console.log(`Created Invoice: ${invoicePath}`);
}

function createPaymentProof(filename: string, amount: string, date: string, ref: string, recipientName: string) {
  const doc = new PDFDocument({ margin: 50 });
  const proofPath = path.join(dir, filename);
  doc.pipe(fs.createWriteStream(proofPath));

  doc.fontSize(18).text("Transfer Receipt", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(12).text("Status: COMPLETED", { align: "center", bold: true });
  doc.moveDown(2);

  doc.fontSize(14).text("Amount Sent:");
  doc.fontSize(20).text(amount, { bold: true, color: "green" });
  doc.moveDown(2);

  doc.fontSize(12).text(`Transaction Date: ${date}`, { color: "black" });
  doc.text(`Reference No: TRX-${Math.floor(Math.random() * 1000000)}`);
  doc.text(`Message / Note: ${ref}`);
  
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
  doc.moveDown();

  doc.text("Sender Details:");
  doc.fontSize(10).text("Name: Global Treasury Inc\nAccount Type: Business\nSource Currency: MYR (Deducted from local account)");

  doc.moveDown();
  doc.fontSize(12).text("Recipient Details:");
  doc.fontSize(10).text(`Name: ${recipientName}\nAccount Number: *********${Math.floor(Math.random() * 9000 + 1000)}`);

  doc.moveDown(3);
  doc.fontSize(9).text("Note: This receipt confirms that the funds have been dispatched. The exchange rate applied to the sender's account is managed by the clearing bank and is not reflected on this generic transfer receipt.", { align: "center", color: "grey" });

  doc.end();
  console.log(`Created Payment Proof: ${proofPath}`);
}

// Global Treasury Inc Address
const gtName = "Global Treasury Inc";
const gtAddress = "Level 42, Petronas Twin Towers\nKuala Lumpur 50088\nMalaysia";

// Transaction 1 (TechNova)
createInvoice(
  "invoice_technova_usd_inv2026-999.pdf",
  "TechNova Solutions", "123 Tech Valley Drive\nSan Francisco, CA 94107\nUnited States",
  gtName, gtAddress,
  "INV-2026-999", "May 15, 2026", "Enterprise Software License - Q3 2026", "USD 15,000.00"
);
createPaymentProof("payment_proof_technova_inv2026-999.pdf", "15,000.00 USD", "May 18, 2026", "INV-2026-999", "TechNova Solutions");

// Transaction 2 (Berlin Cloud)
createInvoice(
  "invoice_berlincloud_eur_invbcs0042.pdf",
  "Berlin Cloud Services", "Alexanderplatz 1\n10178 Berlin\nGermany",
  gtName, gtAddress,
  "BCS0042", "May 10, 2026", "Cloud Hosting Infrastructure", "EUR 8,500.00"
);
createPaymentProof("payment_proof_berlincloud_bcs0042.pdf", "8,500.00 EUR", "May 19, 2026", "BCS0042", "Berlin Cloud Services");

// Transaction 3 (Merlion Tech)
createInvoice(
  "invoice_merlion_sgd_invsg881.pdf",
  "Merlion Tech Pte Ltd", "Marina Bay Sands, Tower 1\nSingapore 018956",
  gtName, gtAddress,
  "INVSG881", "May 20, 2026", "API Integration Services", "SGD 25,000.00"
);
createPaymentProof("payment_proof_merlion_invsg881.pdf", "25,000.00 SGD", "May 25, 2026", "INVSG881", "Merlion Tech Pte Ltd");

