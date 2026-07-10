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
function LayoutDiagram({ mode }: { mode: LayoutMode }) {
  if (mode === "unroll") {
    return (
      <div className="flex justify-center">
        {[0, 1, 2].map((i) => (
          <div key={i} className="mini-page first:ml-0 -ml-3" />
        ))}
      </div>
    );
  }
  if (mode === "stack") {
    return (
      <div className="relative mx-auto h-[42px] w-[34px]">
        {[2, 1, 0].map((i) => (
          <div
            key={i}
            className="mini-page absolute"
            style={{ left: i * 4, bottom: i * 4 }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <div className="mini-page" />
    </div>
  );
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <main className="mx-auto w-full max-w-[800px] px-[10px] pb-16 pt-10">
      <div className="card mb-[10px] px-5 py-[30px] text-center">
        <h1 className="text-[32px] font-bold leading-[1.6em]">
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
        <p className="font-light mt-1 text-[17px]">
          Turn any PDF into a pretty preview image
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Layout"
        className="mb-[10px] grid grid-cols-3 gap-[10px] max-[600px]:grid-cols-1"
      >
        {MODES.map((m) => (
          <div
            key={m.value}
            role="radio"
            aria-checked={mode === m.value}
            tabIndex={0}
            onClick={() => selectMode(m.value)}
            onKeyDown={(e) => e.key === "Enter" && selectMode(m.value)}
            className="card option-card lift px-4 pb-4 pt-5 text-center"
          >
            <div className="flex h-[46px] items-end justify-center pb-1">
              <LayoutDiagram mode={m.value} />
            </div>
            <div className="mt-2 text-[18px] font-bold">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="card mb-[10px] px-5 py-[30px] text-center">
        <div
          className={`dropzone px-5 py-10 ${dragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <div className="page-emoji text-[40px]">📄</div>
          <div className="mt-3 text-[18px] font-bold">
            {fileName ?? "Drop your PDF here"}
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

        <div className="font-light my-4 text-[15px]">or paste a link</div>

        <div className="mx-auto flex max-w-[440px] gap-[10px]">
          <input
            className="neal-input min-w-0 flex-1"
            placeholder="https://arxiv.org/pdf/1706.03762"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUrl()}
          />
          <button className="btn-cream" onClick={handleUrl} disabled={busy || !url.trim()}>
            {busy ? "Fetching…" : "Fetch"}
          </button>
        </div>

        {error && <p className="note-error mt-4 text-[15px]">{error}</p>}
        {busy && <p className="font-light mt-4 text-[15px]">Rendering pages…</p>}
      </div>

      {previewUrl && !busy && (
        <div className="card mb-[10px] px-5 pb-[40px] pt-[30px] text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Generated PDF preview"
            className="mx-auto max-h-[65vh] w-auto max-w-full"
          />
          {note && <p className="font-light mt-3 text-[14px]">{note}</p>}
          <div className="mt-6">
            <a href={previewUrl} download="pdf2preview.png">
              <button className="btn-green lift">Download image</button>
            </a>
          </div>
        </div>
      )}

      <footer className="font-light mt-8 text-center text-[15px]">
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
