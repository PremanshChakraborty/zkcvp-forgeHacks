// apps/web/tests/auth/magic-link-sender.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import nodemailer from "nodemailer";
import {
  consoleMagicLinkSender,
  getMagicLinkSender,
  magicLinkDelivery,
  smtpMagicLinkSender,
} from "../../lib/auth/magic-link-sender";
import { resetEnvCache } from "../../lib/env";

const VALID_DB = "postgresql://u:p@host:5432/db";

function configureMailbox(): void {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "postmaster@example.com";
  process.env.SMTP_PASSWORD = "app-password";
  process.env.EMAIL_FROM = "postmaster@example.com";
}

beforeEach(() => {
  process.env.DATABASE_URL = VALID_DB;
  process.env.AUTH_SECRET = "test-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
  sendMail.mockReset();
  vi.mocked(nodemailer.createTransport).mockClear();
  resetEnvCache();
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SECRET;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
});

describe("consoleMagicLinkSender", () => {
  it("logs the email and the sign-in url", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await consoleMagicLinkSender({
      email: "s@example.com",
      url: "http://localhost:3000/api/auth/sh/callback/email?token=abc",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [logged] = spy.mock.calls[0] as [string];
    expect(logged).toContain("s@example.com");
    expect(logged).toContain(
      "http://localhost:3000/api/auth/sh/callback/email?token=abc",
    );
  });
});

describe("getMagicLinkSender", () => {
  it("returns the console sender when SMTP_HOST is absent", () => {
    expect(getMagicLinkSender()).toBe(consoleMagicLinkSender);
  });

  it("returns the SMTP sender when a mailbox is configured", () => {
    configureMailbox();
    expect(getMagicLinkSender()).toBe(smtpMagicLinkSender);
  });

  it("reads configuration at call time, not at import time", () => {
    // The seam must not bake a delivery choice into the build — same
    // rationale as lib/env.ts's own call-time contract.
    expect(getMagicLinkSender()).toBe(consoleMagicLinkSender);
    resetEnvCache();
    configureMailbox();
    expect(getMagicLinkSender()).toBe(smtpMagicLinkSender);
  });
});

describe("magicLinkDelivery", () => {
  it("reports console delivery when SMTP_HOST is absent", () => {
    expect(magicLinkDelivery()).toBe("console");
  });

  it("reports email delivery when a mailbox is configured", () => {
    configureMailbox();
    expect(magicLinkDelivery()).toBe("email");
  });

  it("agrees with the sender actually selected", () => {
    // The login confirmation copy is rendered from this value, so a
    // disagreement here would tell a stakeholder their link was emailed when
    // it went to the server log, or the reverse.
    expect(magicLinkDelivery()).toBe("console");
    expect(getMagicLinkSender()).toBe(consoleMagicLinkSender);

    resetEnvCache();
    configureMailbox();

    expect(magicLinkDelivery()).toBe("email");
    expect(getMagicLinkSender()).toBe(smtpMagicLinkSender);
  });
});

describe("smtpMagicLinkSender", () => {
  it("sends to the requested address from EMAIL_FROM", async () => {
    configureMailbox();

    await smtpMagicLinkSender({
      email: "s@example.com",
      url: "https://zkcvp.vercel.app/api/auth/sh/callback/email?token=abc",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [mail] = sendMail.mock.calls[0] as [
      { to: string; from: string; subject: string; text: string; html: string },
    ];
    expect(mail.to).toBe("s@example.com");
    expect(mail.from).toBe("postmaster@example.com");
    expect(mail.subject).toBeTruthy();
  });

  it("carries the sign-in url unaltered in both bodies", async () => {
    configureMailbox();
    const url =
      "https://zkcvp.vercel.app/api/auth/sh/callback/email?token=abc&x=1";

    await smtpMagicLinkSender({ email: "s@example.com", url });

    const [mail] = sendMail.mock.calls[0] as [{ text: string; html: string }];
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
  });

  it("builds the transport from the configured mailbox", async () => {
    configureMailbox();

    await smtpMagicLinkSender({ email: "s@example.com", url: "https://x/y" });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        auth: { user: "postmaster@example.com", pass: "app-password" },
      }),
    );
  });

  it("uses an implicit-TLS transport on port 465", async () => {
    configureMailbox();
    process.env.SMTP_PORT = "465";
    resetEnvCache();

    await smtpMagicLinkSender({ email: "s@example.com", url: "https://x/y" });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });
});
