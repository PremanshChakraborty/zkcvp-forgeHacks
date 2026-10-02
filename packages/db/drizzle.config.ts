// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  /* Readable SQL files rather than an opaque push. Migrations are reviewable
   * artifacts — this project's whole argument is about trustworthy records. */
  verbose: true,
  strict: true,
});
