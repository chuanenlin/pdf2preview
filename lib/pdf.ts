// Client-side PDF page rendering via pdf.js (replaces PyMuPDF).
// Renders each page to an offscreen canvas at 2x scale, matching the
// original `fitz.Matrix(2, 2)` zoom.

export const RENDER_SCALE = 2;
export const MAX_PAGES = 20;

export interface RenderedPdf {
  pages: HTMLCanvasElement[];
  totalPageCount: number;
}

export async function renderPdfPages(data: ArrayBuffer): Promise<RenderedPdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const totalPageCount = doc.numPages;
  const pageCount = Math.min(totalPageCount, MAX_PAGES);

  const pages: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
  }
  await loadingTask.destroy();

  return { pages, totalPageCount };
}
