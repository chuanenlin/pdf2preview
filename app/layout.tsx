import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://pdf2preview.vercel.app"),
  title: "PDF ➡️ Preview",
  description:
    "Turn any PDF into a pretty preview image — perfect for sneak peeks of papers on project websites and slides.",
  openGraph: {
    title: "PDF ➡️ Preview",
    description: "Turn any PDF into a pretty preview image.",
    images: ["/share-card.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF ➡️ Preview",
    description: "Turn any PDF into a pretty preview image.",
    images: ["/share-card.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
