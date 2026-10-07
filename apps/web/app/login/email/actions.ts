// apps/web/app/login/email/actions.ts
"use server";

import { stakeholderSignIn } from "../../../lib/auth/stakeholder";
import { safeReturnPath } from "../../../lib/auth/return-path";
import {
  magicLinkDelivery,
  type MagicLinkDelivery,
} from "../../../lib/auth/magic-link-sender";

export type RequestMagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string; delivery: MagicLinkDelivery }
  | { status: "error"; message: string };

export async function requestMagicLink(
  returnTo: string,
  _prevState: RequestMagicLinkState,
  formData: FormData,
): Promise<RequestMagicLinkState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { status: "error", message: "Enter your email address." };
  }

  try {
    /* redirect: false — this app has no separate "check your email" route;
     * the confirmation renders inline on this same page (see page.tsx).
     * What "sent" means depends on which MagicLinkSender is configured, so
     * the delivery mode travels back with it rather than being assumed by
     * the copy. */
    /* `redirectTo` becomes the callbackUrl embedded in the emailed link, so
     * this is the one place the return path leaves the app — sanitised once
     * more here, because a bound argument is still client-supplied input. */
    await stakeholderSignIn("email", {
      email,
      redirect: false,
      redirectTo: safeReturnPath(returnTo),
    });
    return { status: "sent", email, delivery: magicLinkDelivery() };
  } catch {
    return {
      status: "error",
      message: "Something went wrong sending the link. Try again.",
    };
  }
}
