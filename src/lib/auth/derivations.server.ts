import "server-only";
import { createHmac, hkdfSync } from "node:crypto";
import { derivationSecretSchema } from "./environment.ts";

type Purpose = "rate-limit" | "workspace";
export function derivationKey(secret: string, purpose: Purpose) {
  if (!derivationSecretSchema.safeParse(secret).success) throw new Error("Invalid AUTH_DERIVATION_SECRET");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "base64url"),
    "dear-diary/auth-derivations/v1", `dear-diary/${purpose}/v1`, 32));
}
export function opaqueWorkspaceId(secret: string, ownerId: string) {
  return `w1_${createHmac("sha256", derivationKey(secret, "workspace"))
    .update(JSON.stringify(["owner", ownerId.toLowerCase()]), "utf8").digest("base64url")}`;
}
type LimitNamespace = "native" | "gateway-global" | "gateway-ip" | "destination" | "mail-daily";
export function limitIdentity(namespace: LimitNamespace, ...identifiers: string[]) {
  return JSON.stringify([namespace, ...identifiers]);
}
