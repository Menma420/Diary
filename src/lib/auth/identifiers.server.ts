import "server-only";
import { isIP } from "node:net";

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
// Canonical IPv4 or IPv6 /64, matching Better Auth's conservative subnet rule.
export function normalizeIP(value: string): string | null {
  const ip = value.trim(); const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  if (canonical.startsWith("::ffff:")) {
    const parts = canonical.slice(7).split(":");
    const high = Number.parseInt(parts[0]!, 16); const low = Number.parseInt(parts[1]!, 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  const [left = "", right] = canonical.split("::");
  const a = left ? left.split(":") : []; const b = right ? right.split(":") : [];
  const groups = right === undefined ? a : [...a, ...Array<string>(8 - a.length - b.length).fill("0"), ...b];
  return [...groups.slice(0, 4), "0", "0", "0", "0"].map(group => group.padStart(4, "0")).join(":");
}
