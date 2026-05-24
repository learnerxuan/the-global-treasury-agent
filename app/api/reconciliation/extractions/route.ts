import { NextResponse } from "next/server";
import { extractReconciliationDocuments, type ReconciliationExtractionRequest, type UploadedDocument } from "../../../../src/server/input-extraction/reconciliation-workflow";

export const runtime = "nodejs";

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  return "text/plain";
}

async function uploadFromFile(file: File): Promise<UploadedDocument> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    fileName: file.name,
    mimeType: inferMimeType(file),
    contentBase64: bytes.toString("base64")
  };
}

async function uploadsFromFormData(formData: FormData, key: string, legacyKey?: string): Promise<UploadedDocument[]> {
  let values = formData.getAll(key);
  if (values.length === 0 && legacyKey) {
    values = formData.getAll(legacyKey);
  }

  const files = values.filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) {
    throw new Error(`Upload at least one file for ${key}.`);
  }

  return Promise.all(files.map(uploadFromFile));
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload: ReconciliationExtractionRequest = {
      invoices: await uploadsFromFormData(formData, "invoices", "invoice"),
      bankStatements: await uploadsFromFormData(formData, "bankStatements", "bankStatement"),
      paymentProofs: await uploadsFromFormData(formData, "paymentProofs", "paymentProof")
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
