// Canvas compositing: border + drop shadow per page, then arrange pages
// into one of three layouts (replaces the PIL pipeline).

export type LayoutMode = "unroll" | "stack" | "cover";

const BORDER = 1; // black outline, matches ImageOps.expand(border=1)
const PAD = 20; // room around each page for the shadow to bleed into
const SHADOW_BLUR = 10; // matches ImageFilter.GaussianBlur(10)

// Draw a page with a 1px black border and a soft drop shadow.
// Canvas has native shadow support, so this is simpler than the PIL
// version (which hand-built a shadow layer and blurred it).
export function decoratePage(page: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = page.width + 2 * (BORDER + PAD);
  out.height = page.height + 2 * (BORDER + PAD);
  const ctx = out.getContext("2d")!;

  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = SHADOW_BLUR;
  ctx.fillStyle = "black";
  // The border rectangle casts the shadow, then the page is drawn inside it.
  ctx.fillRect(PAD, PAD, page.width + 2 * BORDER, page.height + 2 * BORDER);
  ctx.shadowBlur = 0;
  ctx.drawImage(page, PAD + BORDER, PAD + BORDER);
  return out;
}

export interface Layout {
  width: number; // final canvas width
  height: number; // final canvas height
  // positions[i] = top-left corner of page i (0-indexed, page 0 = first PDF page)
  positions: { x: number; y: number }[];
}

// Compute where each (decorated) page goes on the final canvas.
//
// All pages share the same decorated size `w` x `h`; `n` is the page count.
// Page 0 is always drawn ON TOP (compose() draws in reverse index order),
// so positions only need to describe geometry, not stacking order.
//
// Spacing is proportional to page width rather than the original's fixed
// pixel constants (700px overlap, 10px step), which assumed letter-size
// pages at 2x zoom. The fractions below reproduce the original look for
// letter pages while scaling sensibly for slide decks and odd paper sizes.
export function layoutPositions(
  n: number,
  w: number,
  h: number,
  mode: LayoutMode
): Layout {
  if (mode === "cover" || n === 1) {
    return { width: w, height: h, positions: [{ x: 0, y: 0 }] };
  }

  if (mode === "unroll") {
    // Pages fan out to the right; each page reveals `stride` px of the
    // page beneath it, page 0 fully visible at the far left.
    const stride = Math.round(0.45 * w); // original: w - 700 ≈ 0.45 * w
    return {
      width: w + stride * (n - 1),
      height: h,
      positions: Array.from({ length: n }, (_, i) => ({ x: i * stride, y: 0 })),
    };
  }

  // Stack: diagonal cascade; page 0 at bottom-left, each later page one
  // step up and to the right.
  const step = Math.max(6, Math.round(0.008 * w)); // original: 10px ≈ 0.008 * w
  return {
    width: w + step * (n - 1),
    height: h + step * (n - 1),
    positions: Array.from({ length: n }, (_, i) => ({
      x: i * step,
      y: (n - 1 - i) * step,
    })),
  };
}

// Arrange decorated pages onto the final canvas.
export function compose(
  pages: HTMLCanvasElement[],
  mode: LayoutMode
): HTMLCanvasElement {
  const decorated = pages.map(decoratePage);
  const { width: w, height: h } = decorated[0];
  const layout = layoutPositions(decorated.length, w, h, mode);

  const out = document.createElement("canvas");
  out.width = layout.width;
  out.height = layout.height;
  const ctx = out.getContext("2d")!;

  // Reverse order so lower-indexed pages land on top.
  for (let i = layout.positions.length - 1; i >= 0; i--) {
    const { x, y } = layout.positions[i];
    ctx.drawImage(decorated[i], x, y);
  }
  return out;
}
