// apps/web/app/sign-out.ts
"use server";

import { developerSignOut } from "../lib/auth/developer";
import { stakeholderSignOut } from "../lib/auth/stakeholder";

/**
 * Signs out of ONE Auth.js instance — the one the header said the visitor is
 * using — because the two are separate installs with separately scoped cookies
 * and neither can clear the other's.
 *
 * That matters more than it looks: both cookies can be live at once, and
 * `requireSession()` prefers the developer. Signing out of the developer
 * instance therefore does not sign the visitor out; it reveals the stakeholder
 * session that was underneath. Redirecting to /projects rather than /login is
 * what makes that legible — whoever is left is who the header names next.
 */
export async function signOutAction(kind: "developer" | "stakeholder") {
  if (kind === "developer") {
    await developerSignOut({ redirectTo: "/projects" });
    return;
  }
  await stakeholderSignOut({ redirectTo: "/projects" });
}
