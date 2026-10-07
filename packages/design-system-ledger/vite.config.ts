import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev server for the gallery.
 *
 * The manifest and `node_modules` live here at the design system root rather
 * than inside `preview-app/`, because `components/` is the deliverable and
 * `preview-app/` is only the harness that renders it. Resolving `react` from a
 * sibling app folder would work for the app and fail for the library.
 */
export default defineConfig({
  root: "preview-app",
  plugins: [react()],
  server: {
    open: true,
    /* Component and gallery source live one level above the Vite root; the
     * hoisted workspace node_modules lives three levels above it. */
    fs: { allow: ["..", "../../.."] },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
