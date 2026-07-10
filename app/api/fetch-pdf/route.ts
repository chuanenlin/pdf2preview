// Serverless proxy so the browser can load PDFs from arbitrary URLs
// (direct client-side fetches are blocked by CORS on most sites).

import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed, {
      headers: { "User-Agent": "pdf2preview/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch URL" }, { status: 502 });
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: 502 }
    );
  }

  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return NextResponse.json({ error: "PDF too large (50 MB max)" }, { status: 413 });
  }

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "PDF too large (50 MB max)" }, { status: 413 });
  }
  // Sniff the magic bytes rather than trusting content-type headers.
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
  if (head !== "%PDF-") {
    return NextResponse.json({ error: "URL does not point to a PDF" }, { status: 415 });
  }

  return new NextResponse(buf, {
    headers: { "Content-Type": "application/pdf" },
  });
}
