import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

export const TOKEN_ACTIONS = ["approve", "reject", "confirm"] as const;
export type TokenAction = (typeof TOKEN_ACTIONS)[number];

const key = () => `${SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ADMIN_PASSWORD ?? ""}`;

export const signAction = (action: TokenAction, id: string) =>
  createHmac("sha256", key()).update(`${action}:${id}`).digest("base64url").slice(0, 32);

export const verifyAction = (action: string, id: string, token: string) => {
  if (!TOKEN_ACTIONS.includes(action as TokenAction)) return false;
  const expected = signAction(action as TokenAction, id);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const actionUrl = (base: string, action: TokenAction, id: string) => `${base}/do/${action}/${id}/${signAction(action, id)}`;
