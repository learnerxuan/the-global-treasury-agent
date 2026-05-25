import Tesseract from "tesseract.js";
import engData from "@tesseract.js-data/eng";

export type OcrResult = { text: string; confidence: number };

export async function extractImageText(imagePath: string): Promise<OcrResult> {
  const result = await Tesseract.recognize(imagePath, "eng", {
    langPath: engData.langPath,
    gzip: engData.gzip,
    logger: () => {}
  });

  return { text: result.data.text.trim(), confidence: result.data.confidence };
}
