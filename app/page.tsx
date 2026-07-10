"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { renderPdfPages, MAX_PAGES } from "@/lib/pdf";
import { compose, type LayoutMode } from "@/lib/compose";

const MODES: { value: LayoutMode; label: string; hint: string }[] = [
  { value: "unroll", label: "Unroll", hint: "pages fan out side by side" },
  { value: "stack", label: "Stack", hint: "diagonal cascade" },
  { value: "cover", label: "Cover", hint: "first page only" },
];

export default function Home() {
  const [mode, setMode] = useState<LayoutMode>("unroll");
  const [fileName, setFileName] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
      toast.error(err instanceof Error ? err.message : "Failed to compose preview");
    }
  }, []);

  const loadPdf = useCallback(
    async (data: ArrayBuffer, name: string) => {
      setBusy(true);
      try {
        const { pages, totalPageCount } = await renderPdfPages(data);
        pagesRef.current = pages;
        setFileName(name);
        if (totalPageCount > MAX_PAGES) {
          toast.info(`Using the first ${MAX_PAGES} of ${totalPageCount} pages`);
        }
        regenerate(mode);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not read PDF");
      } finally {
        setBusy(false);
      }
    },
    [mode, regenerate]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please choose a PDF file");
        return;
      }
      await loadPdf(await file.arrayBuffer(), file.name);
    },
    [loadPdf]
  );

  const handleUrl = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Could not fetch PDF from URL");
      }
      await loadPdf(await res.arrayBuffer(), url.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch PDF");
      setBusy(false);
    }
  }, [url, loadPdf]);

  const selectMode = (value: string) => {
    const next = value as LayoutMode;
    setMode(next);
    regenerate(next);
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          PDF <span aria-hidden>➡️</span> Preview
        </h1>
        <p className="mt-3 text-muted-foreground">
          Generate a preview image for your PDF — entirely in your browser.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="flex flex-col gap-3">
            <Label>Layout</Label>
            <RadioGroup
              value={mode}
              onValueChange={selectMode}
              className="grid grid-cols-3 gap-3"
            >
              {MODES.map((m) => (
                <Label
                  key={m.value}
                  htmlFor={m.value}
                  className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    <RadioGroupItem value={m.value} id={m.value} />
                    <span className="font-medium">{m.label}</span>
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {m.hint}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div
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
            className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? "border-primary bg-accent" : "border-muted-foreground/25 hover:bg-accent/50"
            }`}
          >
            <span className="text-sm font-medium">
              {fileName ?? "Drop your PDF here, or click to browse"}
            </span>
            <span className="text-xs text-muted-foreground">
              Your file never leaves your browser
            </span>
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

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="https://arxiv.org/pdf/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrl()}
            />
            <Button variant="secondary" onClick={handleUrl} disabled={busy || !url.trim()}>
              Fetch
            </Button>
          </div>
        </CardContent>
      </Card>

      {busy && (
        <p className="text-center text-sm text-muted-foreground">Processing…</p>
      )}

      {previewUrl && !busy && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Generated PDF preview"
              className="max-h-[70vh] w-auto max-w-full"
            />
            <Button asChild>
              <a href={previewUrl} download="pdf2preview.png">
                Download image
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <footer className="mt-auto text-center text-xs text-muted-foreground">
        By <a className="underline underline-offset-2" href="https://chuanenlin.com">David Chuan-En Lin</a>.
        Code on <a className="underline underline-offset-2" href="https://github.com/chuanenlin/pdf2preview">GitHub</a>.
      </footer>
      <Toaster />
    </main>
  );
}
