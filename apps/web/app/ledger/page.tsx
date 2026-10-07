// apps/web/app/ledger/page.tsx
"use client";

/**
 * The design system gallery, mounted inside the real app.
 *
 * The Vite harness in packages/design-system-ledger renders the same components
 * against its own React and its own CSS pipeline. This route renders them
 * against the app's — next/font, the app's CSS order, the app's React 19 build —
 * which is where an integration problem would actually surface.
 *
 * gallery.css is the gallery's own harness chrome (gx-shell, gx-bar, gx-main,
 * gx-body, ...) — it is not part of the design system's component CSS and is
 * not pulled in by the root layout, so it has to be imported here explicitly.
 */
import "@zkcvp/design-system-ledger/gallery/gallery.css";
import { Gallery } from "@zkcvp/design-system-ledger/gallery";

export default function LedgerPage() {
  return <Gallery />;
}
