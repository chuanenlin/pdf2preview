"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { renderPdfPages, MAX_PAGES } from "@/lib/pdf";
import { compose, type LayoutMode } from "@/lib/compose";

const MODES: { value: LayoutMode; label: string }[] = [
  { value: "unroll", label: "Unroll" },
  { value: "stack", label: "Stack" },
  { value: "cover", label: "Cover" },
];

// Tiny self-explanatory diagram of each layout, drawn with page glyphs.
function LayoutDiagram({ mode, small = false }: { mode: LayoutMode; small?: boolean }) {
  const page = small ? "mini-page sm" : "mini-page";
  if (mode === "unroll") {
    return (
      <div className="flex justify-center">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${page} ${i > 0 ? (small ? "-ml-2" : "-ml-3") : ""}`} />
        ))}
      </div>
    );
  }
  if (mode === "stack") {
    const off = small ? 3 : 4;
    const w = (small ? 15 : 26) + off * 2;
    const h = (small ? 19 : 34) + off * 2;
    return (
      <div className="relative" style={{ width: w, height: h }}>
        {[2, 1, 0].map((i) => (
          <div key={i} className={`${page} absolute`} style={{ left: i * off, bottom: i * off }} />
        ))}
      </div>
    );
  }
  return <div className={page} />;
}

// "attention-is-all-you-need.pdf" + unroll -> "attention-is-all-you-need-unroll.png"
function downloadName(source: string | null, mode: LayoutMode): string {
  let base = source ?? "";
  try {
    if (/^https?:/i.test(base)) {
      const segments = new URL(base).pathname.split("/").filter(Boolean);
      base = segments[segments.length - 1] ?? "";
    }
  } catch {
    // keep base as-is
  }
  base = base
    .replace(/\.pdf$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "pdf2preview"}-${mode}.png`;
}

export default function Home() {
  const [mode, setMode] = useState<LayoutMode>("unroll");
  const [fileName, setFileName] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [arrowRolling, setArrowRolling] = useState(false);
  const pagesRef = useRef<HTMLCanvasElement[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const studio = previewUrl !== null;

  const regenerate = useCallback((nextMode: LayoutMode) => {
    const pages = pagesRef.current;
    if (!pages) return;
    try {
      const canvas = compose(pages, nextMode);
      canvas.toBlob((blob) => {
        if (!blob) return;
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      }, "image/png");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compose preview");
    }
  }, []);

  const loadPdf = useCallback(
    async (data: ArrayBuffer, name: string) => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const { pages, totalPageCount } = await renderPdfPages(data);
        pagesRef.current = pages;
        setFileName(name);
        if (totalPageCount > MAX_PAGES) {
          setNote(`Using the first ${MAX_PAGES} of ${totalPageCount} pages`);
        }
        regenerate(mode);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read PDF");
      } finally {
        setBusy(false);
      }
    },
    [mode, regenerate]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("That doesn't look like a PDF");
        return;
      }
      await loadPdf(await file.arrayBuffer(), file.name);
    },
    [loadPdf]
  );

  const handleUrl = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not fetch PDF from URL");
      }
      await loadPdf(await res.arrayBuffer(), url.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch PDF");
      setBusy(false);
    }
  }, [url, loadPdf]);

  const selectMode = (value: LayoutMode) => {
    setMode(value);
    regenerate(value);
  };

  const reset = () => {
    pagesRef.current = null;
    setFileName(null);
    setUrl("");
    setError(null);
    setNote(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  };

  // The whole window is a drop target: first PDF starts, next PDF replaces.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) handleFile(file);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const title = (
    <h1 className={studio ? "text-center text-[20px] font-bold" : "text-[32px] font-bold leading-[1.6em]"}>
      PDF{" "}
      <span
        aria-hidden
        className={`title-arrow ${arrowRolling ? "rolling" : ""}`}
        onClick={() => setArrowRolling(true)}
        onAnimationEnd={() => setArrowRolling(false)}
      >
        ➡️
      </span>{" "}
      Preview
    </h1>
  );

  return (
    <main
      className={`mx-auto flex min-h-screen w-full flex-col px-[10px] pb-6 ${
        studio ? "max-w-[1200px] pt-5" : "max-w-[800px] pt-10"
      }`}
    >
      {studio && dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">Drop to replace 📄</div>
        </div>
      )}

      {!studio && (
        <>
          <div className="card mb-[10px] px-5 py-[30px] text-center">
            {title}
            <p className="font-light mt-1 text-[17px]">
              Turn any PDF into a pretty preview image
            </p>
          </div>

          <div className="card px-5 py-[30px] text-center">
            <div
              className={`dropzone px-5 py-14 ${dragging ? "dragging" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <div className="page-emoji text-[44px]">📄</div>
              <div className="mt-3 text-[20px] font-bold">
                {busy ? "Rendering pages…" : "Drop your PDF here"}
              </div>
              <div className="font-light mt-1 text-[15px]">
                or click to browse — your file never leaves the browser
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="mx-auto mt-4 flex max-w-[440px] items-center gap-[10px]">
              <input
                className="neal-input min-w-0 flex-1"
                placeholder="or paste a link — https://arxiv.org/pdf/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrl()}
              />
              <button className="btn-cream" onClick={handleUrl} disabled={busy || !url.trim()}>
                {busy ? "Fetching…" : "Fetch"}
              </button>
            </div>

            {error && <p className="note-error mt-4 text-[15px]">{error}</p>}
          </div>
        </>
      )}

      {studio && (
        <>
          <div className="mb-3">{title}</div>

          <div className="card flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 sm:justify-between">
            <div className="flex min-w-0 items-center gap-1">
              <span className="font-light max-w-[220px] truncate text-[15px]" title={fileName ?? ""}>
                📄 {fileName}
              </span>
              <button className="icon-btn" onClick={reset} aria-label="Start over" title="Start over">
                ✕
              </button>
            </div>

            <div role="radiogroup" aria-label="Layout" className="flex items-center gap-2">
              {MODES.map((m) => (
                <div
                  key={m.value}
                  role="radio"
                  aria-checked={mode === m.value}
                  tabIndex={0}
                  onClick={() => selectMode(m.value)}
                  onKeyDown={(e) => e.key === "Enter" && selectMode(m.value)}
                  className="chip"
                >
                  <LayoutDiagram mode={m.value} small />
                  {m.label}
                </div>
              ))}
            </div>

            <a href={previewUrl} download={downloadName(fileName, mode)}>
              <button className="btn-green lift text-[17px]" style={{ padding: "9px 14px" }}>
                Download image
              </button>
            </a>
          </div>

          {(error || note || busy) && (
            <p className={`mt-2 text-center text-[14px] ${error ? "note-error" : "font-light"}`}>
              {error ?? (busy ? "Rendering pages…" : note)}
            </p>
          )}

          <div className="flex flex-1 items-center justify-center py-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Generated PDF preview"
              className="max-w-full"
              style={{ maxHeight: "calc(100vh - 240px)" }}
            />
          </div>
        </>
      )}

      <footer className="font-light mt-auto pt-6 text-center text-[15px]">
        By{" "}
        <a className="underline underline-offset-2" href="https://chuanenlin.com">
          David Chuan-En Lin
        </a>
        . Code on{" "}
        <a
          className="underline underline-offset-2"
          href="https://github.com/chuanenlin/pdf2preview"
        >
          GitHub
        </a>
        .
      </footer>
    </main>
  );
}
