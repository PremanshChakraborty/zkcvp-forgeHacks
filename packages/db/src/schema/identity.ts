import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Stakeholders and developers are ENTIRELY SEPARATE entities — not one users
 * table with a role flag.
 *
 * Every action and audit field in this design is performed by exactly one of the
 * two; nothing anywhere needs to reference "whichever kind of user did this".
 * Separate tables give real database-enforced foreign keys and eliminate the
 * nullable-union columns (an `email OR github_id` column) a single-table design
 * would force. See plan 01, "Core concepts", and invariant 1.
 *
 * A person who is a developer on one project and a stakeholder on another ends
 * up as two unrelated rows. That is accepted in this phase, not a bug.
 */

export const stakeholders = pgTable("stakeholders", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Sole identity key. */
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const developers = pgTable("developers", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * GitHub's NUMERIC user id, stored as text to dodge JS integer limits.
   *
   * Never the username. Usernames are mutable and this must not be — plan 01
   * invariant 2. This is the join key everywhere a developer is referenced by
   * GitHub identity, including invite matching at login.
   */
  githubUserId: text("github_user_id").notNull().unique(),
  /** Cache only, for display. Refreshed on every login. Never a join key. */
  githubUsername: text("github_username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Magic-link verification tokens for the stakeholder Auth.js instance (M3).
 *
 * Shape is dictated by Auth.js's adapter interface, not by plan 01. It holds no
 * OAuth token: the developer's GitHub access token lives only in the encrypted
 * session cookie and is never persisted to any table. That is a deliberate
 * custody choice, and it is why evaluation must run inside a live session.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identifier, t.token] }),
    index("verification_tokens_identifier_idx").on(t.identifier),
  ],
);
