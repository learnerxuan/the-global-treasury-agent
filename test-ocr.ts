import { extractImageText } from "./src/lib/recon/extraction/image-ocr";
import path from "path";

async function main() {
  const testDir = "C:\\Users\\henge\\OneDrive\\Documents\\AI Marathon\\the-global-treasury-agent\\test_sample_1";
  const proofFile = path.join(testDir, "payment_proof_04_cba_southern_cross_rp1005.png");
  try {
    const text = await extractImageText(proofFile);
    console.log("OCR TEXT:\n", text);
  } catch (err) {
    console.error(err);
  }
}

main();
