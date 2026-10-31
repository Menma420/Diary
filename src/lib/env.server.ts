import "server-only";
import { parseIntegrationEnvironment, parseServerEnvironment } from "./env-schema";

export function getServerEnvironment() {
  return parseServerEnvironment(process.env);
}

// Phase 5 and later must use the strict integration boundary before provider access.
export function getIntegrationEnvironment() {
  return parseIntegrationEnvironment(process.env);
}
