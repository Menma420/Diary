import { z } from "zod";

const httpOrigin = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && url.pathname === "/"
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}, "Must be an HTTP(S) origin without credentials, path, query, or fragment")
  .transform((value) => new URL(value).origin);

export const timezoneSchema = z.string().min(1).refine((value) => {
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA timezone");

const foundationSchema = z.object({
  APP_ORIGIN: httpOrigin,
  DEFAULT_TIMEZONE: timezoneSchema.default("Asia/Kolkata"),
});

const integrationSchema = foundationSchema.extend({
  SUPABASE_URL: httpOrigin,
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  OWNER_USER_ID: z.uuid(),
});

export type ServerEnvironment = z.infer<typeof foundationSchema>;
export type IntegrationEnvironment = z.infer<typeof integrationSchema>;

// Report field names only: validation errors must never echo credentials.
function parse<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}. Check .env.example.`);
  }
  return result.data;
}

export function parseServerEnvironment(source: Record<string, string | undefined>): ServerEnvironment {
  const integrationFields = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "OWNER_USER_ID"];
  if (integrationFields.some((key) => source[key] !== undefined)) {
    return parse(integrationSchema, source);
  }
  return parse(foundationSchema, source);
}

export function parseIntegrationEnvironment(source: Record<string, string | undefined>): IntegrationEnvironment {
  return parse(integrationSchema, source);
}
