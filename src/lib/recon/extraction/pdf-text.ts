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
    return result.text.trim();
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
      const text = await extractImageText(imagePath);
      if (text.trim().length > 0) {
        texts.push(`-- OCR page ${page.pageNumber} --\n${text.trim()}`);
      }
    }

    return texts.join("\n\n").trim();
  } finally {
    await parser.destroy();
    await rm(tempDir, { recursive: true, force: true });
  }
}
