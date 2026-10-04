import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "@zkcvp/design-system-ledger/styles/ledger.app.css";
/* After the design system, so app-level layout classes can extend it. */
import "./app.css";
import { LedgerIcons } from "@zkcvp/design-system-ledger/components";
import { AppHeader } from "./AppHeader";

/* Self-hosted at build time by next/font. No network request at runtime, and no
 * render-blocking @import — which is why the app uses `ledger.app.css` rather
 * than `ledger.css`. See "Fonts" in the design system README. */
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
        style={
          {
            "--lg-font-sans": "var(--font-geist-sans), system-ui, sans-serif",
            "--lg-font-mono": "var(--font-geist-mono), ui-monospace, monospace",
          } as React.CSSProperties
        }
      >
        {/* Inside LedgerIcons: the header renders design-system glyphs too. */}
        <LedgerIcons>
          <AppHeader />
          {children}
        </LedgerIcons>
      </body>
    </html>
  );
}
