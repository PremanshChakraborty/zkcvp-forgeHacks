// apps/web/app/AppHeader.tsx
import Link from "next/link";
import { Button, RoleTag } from "@zkcvp/design-system-ledger/components";
import { readViewer } from "../lib/auth/viewer";
import { signOutAction } from "./sign-out";

/**
 * The app's one piece of global chrome.
 *
 * It exists to answer two questions no page in this product could answer on its
 * own: what am I looking at, and who am I looking at it as. The second is not
 * cosmetic here — the two Auth.js instances have separately scoped cookies, both
 * can be live at once, and `requireSession()` silently prefers the developer.
 * Without this bar, a stakeholder holding a stale developer cookie is shown the
 * developer's view of every screen with nothing on the page to explain why.
 *
 * `readViewer()` rather than `requireSession()`: this renders on /login too, and
 * a header that threw a 401 on the sign-in page would be absurd.
 *
 * Three things carry the redesign, and all three are structural rather than
 * decorative:
 *
 *   1. The mark is a lockup, not a word. `ZKCVP` is set in the mono face at
 *      label tracking with a hairline and the one global destination beside it,
 *      so the left of the bar reads as an identity followed by a place rather
 *      than as a link that happens to be bold.
 *   2. The viewer is ONE object. A chip, a name and a button sitting in a row
 *      with equal gaps read as three unrelated controls; the chip and the name
 *      are the same fact about the same person, so they share a bounded well
 *      and sign-out stands outside it as the only control there.
 *   3. The bar sticks. A claims table or a long requirement page scrolls the
 *      identity off screen, and which of two possible sessions is answering for
 *      the page is exactly the thing that must not go out of view.
 */
export async function AppHeader() {
  const viewer = await readViewer();

  return (
    <header className="app-header">
      <div className="lg-container app-header__inner">
        <div className="app-header__brand">
          {/* Home is /projects, not /. `/` only redirects here anyway, and a
              mark that lands on a redirect flickers. */}
          <Link href="/projects" className="app-header__mark">
            ZKCVP
          </Link>
          {viewer && (
            <>
              <span className="app-header__rule" aria-hidden="true" />
              {/* The one destination above every page. It is not marked
                  current: this bar renders on screens that are inside a project
                  and screens that are not, and a link that claims to be the
                  current page on a requirement detail view would be lying. */}
              <Link href="/projects" className="app-header__home">
                Projects
              </Link>
            </>
          )}
        </div>

        {viewer && (
          <div className="app-header__viewer">
            {/* The same hairline that separates the mark from the global link,
                doing the same job: it groups the role and the name against the
                one control beside them, which a box around them did worse. */}
            <span className="app-header__rule" aria-hidden="true" />
            <div className="app-header__identity">
              <RoleTag role={viewer.kind} />
              {/* Truncates rather than wraps: a long email must not give the
                  bar a second line and push every page down. */}
              <span className="lg-truncate app-header__label">
                {viewer.label}
              </span>
            </div>
            <form action={signOutAction.bind(null, viewer.kind)}>
              <Button type="submit" size="sm" tone="quiet">
                Sign out
              </Button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
