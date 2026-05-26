import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

// Resolves a record's `sourceFileId` (== a stored document's `documentId`) back
// to the original uploaded file on disk, so the dashboard can show the actual
// invoice / payment-proof document next to the extracted fields.
//
// The documentId is treated as opaque: it is NEVER used to build a path. We look
// it up in the per-ingestion `documents.json` manifests and only serve a file
// once we have confirmed it lives inside runtime/uploads (path-traversal guard).

const cwd = process.cwd();
const extractedDir = join(/* turbopackIgnore: true */ cwd, "runtime", "extracted");
const uploadsDir = join(/* turbopackIgnore: true */ cwd, "runtime", "uploads");

export type SourceFile = {
  documentId: string;
  fileName: string;
  mimeType: string;
  absolutePath: string;
};

type StoredDocumentManifest = {
  documentId?: string;
  fileName?: string;
  mimeType?: string;
  storageRef?: { uri?: string };
};

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export async function resolveSourceFile(documentId: string): Promise<SourceFile | null> {
  if (!documentId) return null;

  const ingestionsDir = join(extractedDir, "ingestions");
  let ingestionDirs: string[];
  try {
    ingestionDirs = (await readdir(ingestionsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  for (const dir of ingestionDirs) {
    const docsPath = join(ingestionsDir, dir, "documents.json");
    let docs: StoredDocumentManifest[];
    try {
      docs = JSON.parse(await readFile(docsPath, "utf8")) as StoredDocumentManifest[];
    } catch {
      continue;
    }
    const match = Array.isArray(docs) ? docs.find((doc) => doc.documentId === documentId) : undefined;
    const uri = match?.storageRef?.uri;
    if (!match || !uri) continue;

    const absolutePath = isAbsolute(uri) ? uri : resolve(cwd, uri);
    // Only ever serve files that resolve to inside runtime/uploads.
    if (!isInside(absolutePath, uploadsDir)) return null;
    try {
      await stat(absolutePath);
    } catch {
      return null;
    }
    return {
      documentId,
      fileName: match.fileName ?? documentId,
      mimeType: match.mimeType ?? "application/octet-stream",
      absolutePath
    };
  }

  return null;
}
