import "server-only";
import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import { SESSION_SECONDS } from "./environment.ts";
import type { MailSender } from "./mail.ts";
import { limitIdentity } from "./derivations.server.ts";

type Dependencies = {
  pool: Pool; origin: string; secret: string; secure: boolean; mail: MailSender;
  consume: (key: string, rule: { window: number; max: number }) => Promise<{ allowed: boolean; retryAfter: number | null }>;
};
export function createDiaryAuth({ pool, origin, secret, secure, mail, consume }: Dependencies) {
  return betterAuth({
    appName: "Dear Diary", baseURL: origin, basePath: "/api/auth", secret, database: pool,
    trustedOrigins: [origin], telemetry: { enabled: false }, logger: { disabled: true },
    user: { modelName: "auth_user", deleteUser: { enabled: false }, changeEmail: { enabled: false } },
    account: { modelName: "auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verification", storeIdentifier: "hashed" },
    session: { modelName: "auth_session", expiresIn: SESSION_SECONDS, disableSessionRefresh: true, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1800, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => { await mail({ to: user.email, token, kind: "reset" }); },
    },
    emailVerification: { expiresIn: 1800, sendOnSignUp: false, sendOnSignIn: false, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, token }) => { await mail({ to: user.email, token, kind: "verify" }); },
    },
    advanced: { useSecureCookies: secure, cookiePrefix: "dear-diary",
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: "lax", path: "/" },
      crossSubDomainCookies: { enabled: false },
      ipAddress: { ipAddressHeaders: ["x-diary-trusted-ip"] },
    },
    rateLimit: { enabled: true, window: 60, max: 60, customStorage: { consume: (key, rule) => consume(limitIdentity("native", key), rule) },
      customRules: { "/sign-in/email": { window: 60, max: 5 }, "/request-password-reset": { window: 900, max: 3 },
        "/send-verification-email": { window: 900, max: 3 }, "/reset-password": { window: 900, max: 5 }, "/verify-email": { window: 900, max: 5 } },
    },
    databaseHooks: {
      user: { create: { before: async () => false } },
      session: { create: { before: async (session) => {
        const result = await pool.query(`SELECT 1 FROM private.diary_owner AS owner JOIN public.auth_user AS identity ON identity.id = owner.auth_user_id
          WHERE owner.auth_user_id = $1 AND identity."emailVerified" = true`, [session.userId]);
        return result.rowCount === 1 ? { data: { ...session, ipAddress: null, userAgent: null, expiresAt: new Date(Math.min(session.expiresAt.getTime(), session.createdAt.getTime() + SESSION_SECONDS * 1000)) } } : false;
      } } },
    },
    disabledPaths: ["/sign-up/email", "/sign-in/social", "/sign-in/anonymous", "/link-social", "/delete-user", "/change-email", "/update-user", "/list-accounts", "/unlink-account"],
  });
}
