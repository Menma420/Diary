import { describe, expect, it } from "vitest";
import { parseIntegrationEnvironment, parseServerEnvironment } from "@/lib/env-schema";

const foundation = { APP_ORIGIN: "http://localhost:3000" };
const integration = {
  ...foundation,
  SUPABASE_URL: "https://synthetic.example.invalid",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  OWNER_USER_ID: "11111111-1111-4111-8111-111111111111",
};

describe("server environment boundary", () => {
  it("requires the application origin and defaults to the approved timezone", () => {
    expect(() => parseServerEnvironment({})).toThrow("APP_ORIGIN");
    expect(parseServerEnvironment(foundation).DEFAULT_TIMEZONE).toBe("Asia/Kolkata");
  });

  it.each(["ftp://example.com", "https://user:secret@example.com", "https://example.com/path", "https://example.com?query=1", "https://example.com/#fragment"])("rejects non-origin configuration %s", (APP_ORIGIN) => {
    expect(() => parseServerEnvironment({ APP_ORIGIN })).toThrow("APP_ORIGIN");
  });

  it("rejects invalid and blank timezones without silently resetting them", () => {
    for (const DEFAULT_TIMEZONE of ["Not/AZone", "", "+05:30"]) {
      expect(() => parseServerEnvironment({ ...foundation, DEFAULT_TIMEZONE })).toThrow("DEFAULT_TIMEZONE");
    }
  });

  it("requires all integration values as soon as any is configured", () => {
    expect(() => parseServerEnvironment({ ...foundation, SUPABASE_URL: integration.SUPABASE_URL })).toThrow("OWNER_USER_ID");
    expect(() => parseIntegrationEnvironment(foundation)).toThrow("SUPABASE_URL");
    expect(parseIntegrationEnvironment(integration).OWNER_USER_ID).toBe(integration.OWNER_USER_ID);
  });

  it("redacts bad values and strips unrelated environment fields", () => {
    const OWNER_USER_ID = "sensitive-invalid-identity";
    expect(() => parseIntegrationEnvironment({ ...integration, OWNER_USER_ID })).not.toThrow(OWNER_USER_ID);
    expect(() => parseIntegrationEnvironment({ ...integration, OWNER_USER_ID })).toThrow("OWNER_USER_ID");
    expect(parseServerEnvironment({ ...foundation, UNRELATED_SECRET: "never-return" })).not.toHaveProperty("UNRELATED_SECRET");
  });
});
