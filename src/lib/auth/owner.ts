import { z } from "zod";

const sessionSchema = z.object({
  session: z.object({ userId: z.string().min(1), expiresAt: z.coerce.date(), createdAt: z.coerce.date() }),
  user: z.object({ id: z.string().min(1), emailVerified: z.literal(true) }),
});
const bindingSchema = z.object({ owner_id: z.uuid(), auth_user_id: z.string().min(1) });
declare const verified: unique symbol;
export type VerifiedOwner = Readonly<{ ownerId: string; expiresAt: string; [verified]: true }>;
export type OwnerResult = { kind: "owner"; owner: VerifiedOwner } | { kind: "anonymous" | "forbidden" | "unavailable" };
export type PublicAccess = { kind: "owner"; workspaceId: string; expiresAt: string; checkedAt: string } | { kind: "anonymous" | "forbidden" | "unavailable" };
export class OwnerAccessError extends Error {
  constructor(readonly kind: "anonymous" | "forbidden" | "unavailable") { super("Owner access required"); }
}
export function authorizeSession(session: unknown, bindings: unknown[], now = new Date()): OwnerResult {
  if (session === null) return { kind: "anonymous" };
  const parsed = sessionSchema.safeParse(session);
  if (!parsed.success) return { kind: "forbidden" };
  const { user, session: current } = parsed.data;
  if (current.expiresAt <= now || current.createdAt > now || current.expiresAt.getTime() - current.createdAt.getTime() > 7 * 86400_000) return { kind: "anonymous" };
  const binding = bindings.length === 1 ? bindingSchema.safeParse(bindings[0]) : null;
  if (user.id !== current.userId || !binding?.success || binding.data.auth_user_id !== user.id) return { kind: "forbidden" };
  return { kind: "owner", owner: Object.freeze({ ownerId: binding.data.owner_id, expiresAt: current.expiresAt.toISOString() }) as VerifiedOwner };
}
