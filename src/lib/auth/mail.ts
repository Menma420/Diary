import "server-only";
import type { AuthEnvironment } from "./environment.ts";
import { limitIdentity } from "./derivations.server.ts";

export type AuthMail = Readonly<{ to: string; kind: "verify" | "reset"; token: string }>;
export type MailSender = (mail: AuthMail) => Promise<void>;
export function authMailSender(config: AuthEnvironment, consume: (key: string, rule: { window: number; max: number }) => Promise<{ allowed: boolean }>): MailSender {
  return async ({ to, kind, token }) => {
    if (config.AUTH_MAIL_MODE === "unconfigured") throw new Error("Auth email delivery is unavailable");
    if (!(await consume(limitIdentity("mail-daily"), { window: 86400, max: 20 })).allowed) throw new Error("Auth email daily limit reached");
    const url = new URL(kind === "reset" ? "/reset-password" : "/verify-email", config.APP_ORIGIN);
    // Fragments never reach Next.js access logs, rendered HTML/RSC or Referer.
    url.hash = new URLSearchParams({ token }).toString();
    const response = config.AUTH_MAIL_MODE === "sink"
      ? await fetch(new URL("/messages", config.AUTH_MAIL_SINK_URL!), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to, kind, url: url.href }), signal: AbortSignal.timeout(8000), redirect: "error" })
      : await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "content-type": "application/json", "api-key": config.BREVO_API_KEY! },
        body: JSON.stringify({ sender: { email: config.AUTH_MAIL_FROM, name: "Dear Diary" }, to: [{ email: to }],
          subject: kind === "reset" ? "Reset your Dear Diary password" : "Verify your Dear Diary email",
          textContent: `${kind === "reset" ? "Reset your password" : "Verify your email"}: ${url.href}\nThis link expires in 30 minutes. If you did not request it, ignore this email.` }),
        signal: AbortSignal.timeout(8000), redirect: "error",
      });
    if (!response.ok) throw new Error("Auth email delivery failed"); // Never log the response body or API key.
  };
}
