import { z } from "zod";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
// Canonical unpadded base64url encoding of 32 random bytes.
export const derivationSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
export function loopback(host: string) { return ["localhost", "127.0.0.1", "[::1]"].includes(host); }
const schema = z.object({
  APP_ORIGIN: z.url(),
  AUTH_DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32).max(512).refine(value => value.trim() === value && value.trim().length >= 32),
  AUTH_DERIVATION_SECRET: derivationSecretSchema,
  AUTH_MAIL_MODE: z.enum(["unconfigured", "brevo", "sink"]).default("unconfigured"),
  BREVO_API_KEY: z.string().min(20).optional(),
  AUTH_MAIL_FROM: z.email().optional(),
  AUTH_MAIL_SINK_URL: z.url().optional(),
});
export type AuthEnvironment = Readonly<z.infer<typeof schema>>;

// Auth never falls back to the existing production DATABASE_URL or a test secret.
export function parseAuthEnvironment(source: Record<string, string | undefined>): AuthEnvironment {
  const result = schema.safeParse(source);
  if (!result.success) throw new Error(`Invalid auth configuration: ${[...new Set(result.error.issues.map(i => i.path[0]))].join(", ")}`);
  const value = result.data;
  if (value.AUTH_DERIVATION_SECRET === value.BETTER_AUTH_SECRET) throw new Error("Auth derivation and signing secrets must differ");
  const origin = new URL(value.APP_ORIGIN);
  const db = new URL(value.AUTH_DATABASE_URL);
  if (origin.origin !== value.APP_ORIGIN || origin.username || origin.password ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback(origin.hostname))) ||
      !["postgres:", "postgresql:"].includes(db.protocol) || !db.username || !db.password || db.pathname.length < 2) {
    throw new Error("Invalid auth origin or database configuration");
  }
  if (value.AUTH_MAIL_MODE === "brevo" && (!value.BREVO_API_KEY || !value.AUTH_MAIL_FROM)) throw new Error("Auth mail configuration is incomplete");
  if (value.AUTH_MAIL_MODE === "sink") {
    const sink = value.AUTH_MAIL_SINK_URL ? new URL(value.AUTH_MAIL_SINK_URL) : null;
    if (!loopback(origin.hostname) || !loopback(db.hostname) || !sink || sink.protocol !== "http:" || !loopback(sink.hostname) || sink.username || sink.password || sink.search || sink.hash) {
      throw new Error("The mail sink requires an entirely loopback test environment");
    }
  }
  return Object.freeze(value);
}
