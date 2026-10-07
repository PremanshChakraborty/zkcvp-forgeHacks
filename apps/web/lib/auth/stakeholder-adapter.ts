// apps/web/lib/auth/stakeholder-adapter.ts
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { Db } from "@zkcvp/db";
import {
  createStakeholder,
  createVerificationToken,
  getStakeholderByEmail,
  getStakeholderById,
  useVerificationToken,
  type StakeholderRow,
} from "./stakeholder-store";

function toAdapterUser(row: StakeholderRow): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    name: row.displayName,
    /* Not tracked on `stakeholders` — the magic link itself is the
     * verification, so every row this adapter returns is implicitly
     * verified. There is no unverified-stakeholder state in this design. */
    emailVerified: null,
  };
}

/**
 * Maps only to `stakeholders` and `verification_tokens` — see
 * docs/architecture.md, M3, "Why two Auth.js instances". There is no
 * `accounts` table: Auth.js's "email"-type sign-in flow never calls
 * `linkAccount`, and with JWT sessions `createSession`/`getSessionAndUser`/
 * `deleteSession` are never invoked either — only the methods below are.
 */
export function StakeholderAdapter(db: Db): Adapter {
  return {
    async createVerificationToken({ identifier, token, expires }) {
      await createVerificationToken(db, { identifier, token, expires });
      return { identifier, token, expires };
    },

    async useVerificationToken({ identifier, token }) {
      return useVerificationToken(db, { identifier, token });
    },

    async getUserByEmail(email) {
      const row = await getStakeholderByEmail(db, email);
      return row ? toAdapterUser(row) : null;
    },

    async getUser(id) {
      const row = await getStakeholderById(db, id);
      return row ? toAdapterUser(row) : null;
    },

    async createUser(user) {
      /* The magic-link flow never collects a display name — only an email
       * address. Default to the local part of the email; nothing downstream
       * (no profile-edit feature exists yet) depends on this being anything
       * more considered than a placeholder. */
      const displayName = user.name?.trim() || user.email.split("@")[0];
      const row = await createStakeholder(db, {
        email: user.email,
        displayName,
      });
      return toAdapterUser(row);
    },

    async updateUser(user) {
      /* Called on every repeat sign-in to stamp emailVerified — not tracked
       * here (see toAdapterUser), so this is a lookup, not a write. */
      const row = await getStakeholderById(db, user.id);
      if (!row) {
        throw new Error(`updateUser: no stakeholder with id ${user.id}`);
      }
      return toAdapterUser(row);
    },
  };
}
