"use client";

import { useEffect, useState } from "react";

export type ComparePane = {
  label: string;
  documentId: string | null | undefined;
};

type Meta = { documentId: string; fileName: string; mimeType: string };

function fileUrl(documentId: string): string {
  return `/api/files/${encodeURIComponent(documentId)}`;
}

// Renders a single uploaded document: image inline, PDF in an embedded viewer,
// anything else as a download fallback. Fetches the file's mime type first.
function DocumentViewer({ documentId }: { documentId: string | null | undefined }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing">("idle");

  useEffect(() => {
    if (!documentId) {
      setState("missing");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetch(`${fileUrl(documentId)}?meta=1`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("not found"))))
      .then((data: Meta) => {
        if (cancelled) return;
        setMeta(data);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (state === "missing") {
    return <div className="doc-viewer-empty">No source file is available for this record.</div>;
  }
  if (state !== "ready" || !meta || !documentId) {
    return <div className="doc-viewer-empty">Loading document…</div>;
  }

  const url = fileUrl(documentId);
  if (meta.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="doc-viewer-img" src={url} alt={meta.fileName} />;
  }
  if (meta.mimeType === "application/pdf") {
    return <iframe className="doc-viewer-frame" src={url} title={meta.fileName} />;
  }
  return (
    <div className="doc-viewer-empty">
      <p>{meta.fileName}</p>
      <p className="dv-sub">This file type can’t be previewed inline.</p>
      <a className="secondary-button" href={url} target="_blank" rel="noreferrer">
        Open / download
      </a>
    </div>
  );
}

export function DocumentCompare({ title, panes, onClose }: { title: string; panes: ComparePane[]; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="compare-overlay" onClick={onClose} role="presentation">
      <div
        className="compare-shell"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="compare-header">
          <span className="compare-title">{title}</span>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="compare-body" data-panes={panes.length}>
          {panes.map((pane, index) => (
            <div className="compare-pane" key={`${pane.label}-${index}`}>
              <div className="compare-pane-head">
                <span className="cp-label">{pane.label}</span>
                {pane.documentId ? (
                  <a className="cp-open" href={fileUrl(pane.documentId)} target="_blank" rel="noreferrer">
                    Open in new tab ↗
                  </a>
                ) : null}
              </div>
              <div className="compare-pane-body">
                <DocumentViewer documentId={pane.documentId} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
