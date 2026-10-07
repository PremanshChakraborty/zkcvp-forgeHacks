/**
 * Next.js App Router root layout. Drop-in.
 *
 * Copy to `app/layout.tsx` in the Next app once it is scaffolded. Two things
 * happen here and nowhere else:
 *
 *   1. The stylesheet is imported ONCE, at the root. Importing it per route
 *      duplicates the token block in every chunk.
 *   2. Geist is loaded through `next/font`, which self-hosts the files, emits a
 *      preload link, and gives a stable CSS variable. The @import in
 *      `styles/fonts.css` exists only so the hand-written preview pages render
 *      the real typeface without a build step — it blocks render and cannot be
 *      preloaded, so it must not ship. Import `ledger.css` and then override the
 *      family variables as below, or edit `ledger.css` to drop the fonts line.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "@/design-system-ledger/styles/ledger.css";

/* Self-hosted at build time by next/font. No network request at runtime. */
const geistSans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZKCVP",
  description:
    "Independent machine attestation over real source at pinned commits.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * No `data-theme` here. Ledger is light-first with the dark values applied
     * by `prefers-color-scheme`, so leaving the attribute off means the app
     * follows the reader's OS. A theme toggle sets it explicitly, and the
     * attribute selectors in tokens.css beat the media query in both directions.
     */
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body
        /*
         * Point the system's family tokens at the next/font variables. This is
         * the whole integration: every component reads --lg-font-sans and
         * --lg-font-mono, so nothing else has to change.
         */
        style={{
          // @ts-expect-error custom properties are valid inline style keys
          "--lg-font-sans": "var(--font-geist-sans), system-ui, sans-serif",
          "--lg-font-mono": "var(--font-geist-mono), ui-monospace, monospace",
        }}
      >
        {children}
      </body>
    </html>
  );
}
