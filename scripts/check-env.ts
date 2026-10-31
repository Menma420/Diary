import { parseIntegrationEnvironment, parseServerEnvironment } from "../src/lib/env-schema.ts";

try {
  const parse = process.argv.includes("--integrations")
    ? parseIntegrationEnvironment : parseServerEnvironment;
  parse(process.env);
  console.log("Server environment valid (values redacted).");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment validation failed.");
  process.exitCode = 1;
}
