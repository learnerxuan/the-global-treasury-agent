import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PaymentProofInputDescriptor, Warning } from "../types";
import { makeWarning } from "./evidence";

export type ProofSource = {
  mode: "real_file" | "unreadable";
  fileName: string;
  mimeType: PaymentProofInputDescriptor["mimeType"];
  localPath?: string;
  bytes?: Buffer;
  text?: string;
  table?: string[][];
  fallbackReason?: string;
  warnings: Warning[];
};

export async function readProofSource(descriptor: PaymentProofInputDescriptor): Promise<ProofSource> {
  if (descriptor.storageRef?.kind === "local_path") {
    const resolvedPath = resolve(descriptor.storageRef.uri);

    try {
      const bytes = await readFile(resolvedPath);
      const source: ProofSource = {
        mode: "real_file",
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        localPath: resolvedPath,
        bytes,
        warnings: []
      };
      if (descriptor.mimeType === "text/plain") {
        source.text = bytes.toString("utf8");
      }
      return source;
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : `Unable to read ${descriptor.storageRef.uri}`;
      return {
        mode: "unreadable",
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        fallbackReason,
        warnings: [
          makeWarning(
            "LOW_QUALITY_PROOF",
            `Real proof could not be read: ${descriptor.storageRef.uri}`,
            "storageRef"
          )
        ]
      };
    }
  }

  return {
    mode: "unreadable",
    fileName: descriptor.fileName,
    mimeType: descriptor.mimeType,
    fallbackReason: "No readable local storageRef was provided.",
    warnings: [
      makeWarning("LOW_QUALITY_PROOF", "No readable local proof file was provided.", "storageRef")
    ]
  };
}
