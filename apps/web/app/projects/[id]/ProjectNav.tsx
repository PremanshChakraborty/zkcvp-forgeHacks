// apps/web/app/projects/[id]/ProjectNav.tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { NavStrip } from "@zkcvp/design-system-ledger/components";

export type ProjectSection = "requirements" | "members" | "repositories" | "claims";

/**
 * The four faces of one project, in the header of every one of them.
 *
 * These were buttons in the page header's actions slot, beside "Submit a
 * claim". That put navigation and mutation in the same row wearing the same
 * chrome, so "Members" and "Submit a claim" were indistinguishable until you
 * pressed one. Actions belong in the actions slot; going somewhere is not an
 * action.
 *
 * The anchors are `next/link` carrying the design system's `.lg-tab` class
 * rather than the system's own `NavItem`, and that is deliberate rather than a
 * shortcut: the strip's markup and look are the system's, but the routing is
 * this app's, and `@zkcvp/design-system-ledger` cannot import from Next without
 * becoming a Next package. `NavStrip` exists for exactly this split.
 */
export function ProjectNav({
  projectId,
  active,
  end,
}: {
  projectId: string;
  active: ProjectSection;
  /** Pinned to the far end of the strip. The checklist's count, on the
   *  overview, which is where the section heading used to carry it. */
  end?: ReactNode;
}) {
  const sections: { id: ProjectSection; label: string; href: string }[] = [
    { id: "requirements", label: "Requirements", href: `/projects/${projectId}` },
    { id: "claims", label: "Claims", href: `/projects/${projectId}/claims` },
    {
      id: "repositories",
      label: "Repositories",
      href: `/projects/${projectId}/repos`,
    },
    { id: "members", label: "Members", href: `/projects/${projectId}/members` },
  ];

  return (
    <NavStrip label="Project sections" end={end}>
      {sections.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          className="lg-tab"
          /* `aria-current="page"`, never `aria-selected`: these are separate
           * URLs, not panels of one view. The design system's active rule
           * answers to both, so the two patterns look identical and announce
           * themselves honestly. */
          aria-current={section.id === active ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </NavStrip>
  );
}
