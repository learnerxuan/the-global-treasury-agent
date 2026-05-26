import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveSourceFile } from "../../../../src/server/reconciliation/source-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serves an original uploaded document by its documentId (a record's sourceFileId).
//   GET /api/files/<documentId>          -> streams the file inline (PDF/image/etc.)
//   GET /api/files/<documentId>?meta=1   -> { documentId, fileName, mimeType }
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await context.params;
  const file = await resolveSourceFile(documentId);
  if (!file) {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  if (new URL(request.url).searchParams.get("meta") === "1") {
    return NextResponse.json({
      documentId: file.documentId,
      fileName: file.fileName,
      mimeType: file.mimeType
    });
  }

  const bytes = await readFile(file.absolutePath);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "private, max-age=60"
    }
  });
}
