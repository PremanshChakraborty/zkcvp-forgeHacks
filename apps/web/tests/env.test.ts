import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "../lib/env";

const VALID = "postgresql://u:p@host:5432/db";

afterEach(() => {
  resetEnvCache();
  delete process.env.DATABASE_URL;
  delete process.env.EVAL_CEILING_SECONDS;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_GITHUB_ID;
  delete process.env.AUTH_GITHUB_SECRET;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
});

describe("env", () => {
  it("parses a valid environment", () => {
    process.env.DATABASE_URL = VALID;
    process.env.EVAL_CEILING_SECONDS = "300";
    process.env.AUTH_SECRET = "test-secret";
    expect(env().DATABASE_URL).toBe(VALID);
    expect(env().EVAL_CEILING_SECONDS).toBe(300);
  });

  it("defaults EVAL_CEILING_SECONDS when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().EVAL_CEILING_SECONDS).toBe(300);
  });

  it("throws a named error when DATABASE_URL is missing", () => {
    process.env.AUTH_SECRET = "test-secret";
    expect(() => env()).toThrow(/DATABASE_URL/);
  });

  it("throws a named error when AUTH_SECRET is missing", () => {
    process.env.DATABASE_URL = VALID;
    expect(() => env()).toThrow(/AUTH_SECRET/);
  });

  it("leaves AUTH_GITHUB_ID/AUTH_GITHUB_SECRET undefined when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().AUTH_GITHUB_ID).toBeUndefined();
    expect(env().AUTH_GITHUB_SECRET).toBeUndefined();
  });

  it("reads process.env at call time, not at import time", () => {
    // The host is undecided, so config must not be baked into the build.
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().DATABASE_URL).toBe(VALID);
    resetEnvCache();
    process.env.DATABASE_URL = "postgresql://u:p@other:5432/db";
    expect(env().DATABASE_URL).toContain("other");
  });

  it("leaves SMTP settings undefined when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().SMTP_HOST).toBeUndefined();
    expect(env().SMTP_USER).toBeUndefined();
    expect(env().SMTP_PASSWORD).toBeUndefined();
    expect(env().EMAIL_FROM).toBeUndefined();
  });

  it("defaults SMTP_PORT to 587 when unset", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    expect(env().SMTP_PORT).toBe(587);
  });

  it("parses a fully configured mailbox", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "postmaster@example.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.EMAIL_FROM = "postmaster@example.com";
    expect(env().SMTP_HOST).toBe("smtp.example.com");
    expect(env().SMTP_PORT).toBe(465);
    expect(env().EMAIL_FROM).toBe("postmaster@example.com");
  });

  it("rejects a half-configured mailbox rather than falling back silently", () => {
    // A missing credential must not degrade to the console sender in
    // production — sign-in links would go to the server log and stakeholders
    // would see nothing arrive, while the deployment looks healthy.
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "postmaster@example.com";
    // SMTP_PASSWORD and EMAIL_FROM deliberately absent
    expect(() => env()).toThrow(/SMTP_PASSWORD/);
  });

  it("names every missing SMTP field, not just the first", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    expect(() => env()).toThrow(/EMAIL_FROM/);
  });

  it("requires EMAIL_FROM to be an address", () => {
    process.env.DATABASE_URL = VALID;
    process.env.AUTH_SECRET = "test-secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "postmaster@example.com";
    process.env.SMTP_PASSWORD = "app-password";
    process.env.EMAIL_FROM = "not-an-address";
    expect(() => env()).toThrow(/EMAIL_FROM/);
  });
});
