/**
 * Next.js App Router route for the gallery. Drop-in.
 *
 * Copy to `app/ledger/page.tsx`. It renders at /ledger.
 *
 * Note what is NOT here: no `"use client"`. This file is a Server Component, and
 * `Gallery` is the client boundary because it holds the theme, density and tab
 * state. Every component in the system that uses state or an event handler
 * already carries its own `"use client"`, so a page that only composes static
 * markup out of them stays a Server Component.
 */

/* Harness chrome for the gallery only. Do not import this in a real app route. */
import "@/design-system-ledger/gallery/gallery.css";

import { Gallery } from "@/design-system-ledger/gallery/Gallery";

export const metadata = {
  title: "ZKCVP · Ledger design system",
};

export default function LedgerGalleryPage() {
  return <Gallery />;
}
