import { NextResponse } from "next/server";
import { extractReconciliationDocuments, type ReconciliationExtractionRequest, type UploadedDocument } from "../../../../src/server/input-extraction/reconciliation-workflow";

export const runtime = "nodejs";

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  return "text/plain";
}

async function uploadFromFormData(formData: FormData, key: string): Promise<UploadedDocument> {
  const value = formData.get(key);
  if (!(value instanceof File)) {
    throw new Error(`Missing ${key} file.`);
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  return {
    fileName: value.name,
    mimeType: inferMimeType(value),
    contentBase64: bytes.toString("base64")
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload: ReconciliationExtractionRequest = {
      invoice: await uploadFromFormData(formData, "invoice"),
      bankStatement: await uploadFromFormData(formData, "bankStatement"),
      paymentProof: await uploadFromFormData(formData, "paymentProof")
    };

    const result = await extractReconciliationDocuments(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to extract reconciliation documents." },
      { status: 400 }
    );
  }
}
