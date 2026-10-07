// apps/web/lib/auth/stakeholder.ts
import NextAuth from "next-auth";
import { createDb } from "@zkcvp/db";
import { env } from "../env";
import { acceptPendingStakeholderInvites } from "./stakeholder-store";
import { StakeholderAdapter } from "./stakeholder-adapter";
import { StakeholderEmailProvider } from "./stakeholder-email-provider";
import { baseAuthConfig } from "./base-config";
import { IdentityStoreUnavailable } from "./errors";

/**
 * Custom email (magic-link) provider, stakeholders-only adapter, JWT
 * strategy — see docs/architecture.md, M3. Never sees a GitHub sign-in: the
 * adapter maps only to `stakeholders` and `verification_tokens`.
 */
export const {
  handlers: stakeholderHandlers,
  auth: stakeholderAuth,
  signIn: stakeholderSignIn,
  signOut: stakeholderSignOut,
} = NextAuth(() => {
  const e = env();
  const db = createDb(e.DATABASE_URL);
  return {
    ...baseAuthConfig({ prefix: "sh", secret: e.AUTH_SECRET }),
    basePath: "/api/auth/sh",
    adapter: StakeholderAdapter(db),
    providers: [StakeholderEmailProvider()],
    callbacks: {
      async signIn({ user, email }) {
        /* This callback fires twice per magic-link flow: once when the link
         * is REQUESTED (`email.verificationRequest`, before the token is
         * even generated — see @auth/core/lib/actions/signin/send-token.js)
         * and once when it is VERIFIED. At request time, a brand-new
         * stakeholder's `user` is a dummy object with a random id that was
         * never persisted — running invite-acceptance against it would
         * violate the stakeholders FK, so only run it at verification. */
        if (email?.verificationRequest) return true;
        if (!user.id || !user.email) return false;
        try {
          /* Runs on every successful sign-in, new or returning — plan 01,
           * Identity & authentication behavior, point 2. A no-op today since
           * nothing writes a pending project_stakeholder_invites row yet. */
          await acceptPendingStakeholderInvites(db, {
            stakeholderId: user.id,
            email: user.email,
          });
        } catch (cause) {
          /* Reaching the store failed — not a refusal. See errors.ts. The
           * stakeholder id is safe to log; the email is not, so it is left
           * out deliberately. */
          console.error(
            `[auth][sh] identity store unavailable for stakeholder=${user.id}`,
            cause,
          );
          throw new IdentityStoreUnavailable("stakeholder invite sweep failed", {
            cause,
          });
        }
        return true;
      },
      async jwt({ token, user }) {
        if (user?.id) {
          token.stakeholderId = user.id;
        }
        return token;
      },
      async session({ session, token }) {
        session.stakeholderId = token.stakeholderId as string;
        return session;
      },
    },
  };
});
