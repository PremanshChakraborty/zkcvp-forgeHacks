// apps/web/lib/auth/stakeholder-email-provider.ts
import type { EmailConfig } from "next-auth/providers/email";
import { getMagicLinkSender } from "./magic-link-sender";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * A hand-built `type: "email"` provider config rather than next-auth's
 * `Email()`/`Nodemailer()` factory — those ship an SMTP-shaped config
 * surface (`server`, transport options) this app has no use for, since
 * delivery is a plain seam (`MagicLinkSender`, see docs/architecture.md).
 */
export function StakeholderEmailProvider(): EmailConfig {
  return {
    id: "email",
    type: "email",
    name: "Email",
    maxAge: DAY_SECONDS,
    async sendVerificationRequest({ identifier, url }) {
      await getMagicLinkSender()({ email: identifier, url });
    },
  };
}
