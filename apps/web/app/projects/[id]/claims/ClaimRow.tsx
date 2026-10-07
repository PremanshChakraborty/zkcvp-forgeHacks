"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A claims table row that opens its claim from anywhere in the row.
 *
 * The row click is a convenience laid over a real link, never a replacement for
 * one: the cell holding the submission time contains an ordinary `<Link>`, so
 * the row has a focus stop, an accessible name and a working middle-click, and
 * this handler only saves a mouse user from aiming at it. A `<tr>` given
 * `role="link"` and a keydown handler would have to re-earn every one of those
 * and would get some of them wrong.
 *
 * Two clicks are deliberately not navigations. A click that lands on a control
 * inside the row belongs to that control, which is what keeps the commit SHA's
 * copy button working; and a click that ends a text selection is someone
 * copying a commit, not asking to leave the page.
 */
export function ClaimRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      /* The design system already styles an interactive row's hover state; this
       * is the flag it looks for, not a new visual. */
      data-interactive="true"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input, label")) {
          return;
        }
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
