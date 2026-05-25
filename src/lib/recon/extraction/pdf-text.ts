import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import { extractImageText } from "./image-ocr";

export async function extractPdfText(bytes: Buffer): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    // If the PDF has no real text layer (scanned/image-only), fall back to OCR
    if (text.length < 50) {
      try {
        const ocrText = await extractPdfOcrText(bytes);
        if (ocrText.length > text.length) return ocrText;
      } catch {
        // OCR fallback failed; return whatever text we have
      }
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

export async function extractPdfOcrText(bytes: Buffer, firstPages = 2): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  const tempDir = join(tmpdir(), `reconpilot-pdf-ocr-${randomUUID()}`);
  try {
    await mkdir(tempDir, { recursive: true });
    const result = await parser.getScreenshot({
      first: firstPages,
      desiredWidth: 1800,
      imageBuffer: true,
      imageDataUrl: false
    });
    const texts: string[] = [];

    for (const page of result.pages) {
      const imagePath = join(tempDir, `page-${page.pageNumber}.png`);
      await writeFile(imagePath, page.data);
      const ocrResult = await extractImageText(imagePath);
      if (ocrResult.text.trim().length > 0) {
        texts.push(`-- OCR page ${page.pageNumber} --\n${ocrResult.text.trim()}`);
      }
    }

    return texts.join("\n\n").trim();
  } finally {
    await parser.destroy();
    await rm(tempDir, { recursive: true, force: true });
  }
}
