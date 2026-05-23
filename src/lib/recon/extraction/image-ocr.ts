import Tesseract from "tesseract.js";
import engData from "@tesseract.js-data/eng";

export async function extractImageText(imagePath: string): Promise<string> {
  const result = await Tesseract.recognize(imagePath, "eng", {
    langPath: engData.langPath,
    gzip: engData.gzip,
    logger: () => {}
  });

  return result.data.text.trim();
}
