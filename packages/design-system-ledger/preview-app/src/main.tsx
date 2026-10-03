import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/* The real stylesheet. What renders here is what ships. */
import "../../styles/ledger.css";
/* Harness chrome only. Nothing with a `gx-` prefix is part of the system. */
import "../../gallery/gallery.css";

import { Gallery } from "../../gallery/Gallery";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <Gallery />
  </StrictMode>
);
