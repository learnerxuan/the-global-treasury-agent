import type { UploadedDocument } from "./reconciliation-workflow";

export function inferMimeType(file: File): string {
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

export async function uploadFromFile(file: File): Promise<UploadedDocument> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    fileName: file.name,
    mimeType: inferMimeType(file),
    contentBase64: bytes.toString("base64")
  };
}

export async function uploadsFromFormData(formData: FormData, key = "files"): Promise<UploadedDocument[]> {
  const values = formData.getAll(key);
  const files = values.filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length === 0) {
    throw new Error("Upload at least one file.");
  }

  return Promise.all(files.map(uploadFromFile));
}
