// apps/web/lib/auth/viewer.ts
import { developerAuth } from "./developer";
import { stakeholderAuth } from "./stakeholder";

/**
 * Who to NAME in the app header, and nothing else.
 *
 * Deliberately separate from `requireSession()`, which is the authorization
 * read: that one throws a 401 when there is no session, and throws again when a
 * developer session has lost its GitHub token. Both are correct for a page that
 * is about to act on the visitor's behalf and wrong for a header that renders on
 * every route including the signed-out ones.
 *
 * The developer-first precedence is copied from `requireSession()` on purpose.
 * Both cookies can be live at once — they are scoped to different names, see
 * cookies.ts — and the header must say the SAME thing the pages are acting as.
 * A header that named the stakeholder while `requireSession()` resolved the
 * developer would be worse than no header at all.
 */
export type Viewer =
  | { kind: "developer"; label: string }
  | { kind: "stakeholder"; label: string };

export async function readViewer(): Promise<Viewer | null> {
  const dev = await developerAuth();
  if (dev?.developerId) {
    /* The GitHub display name, falling back to the role word rather than to an
     * empty chip. A developer whose profile has no name is still signed in. */
    return { kind: "developer", label: dev.user?.name || "Developer" };
  }

  const sh = await stakeholderAuth();
  if (sh?.stakeholderId) {
    /* A stakeholder has no display name — email is the only identity they gave
     * us, and it is what they typed to get here. */
    return { kind: "stakeholder", label: sh.user?.email || "Stakeholder" };
  }

  return null;
}
