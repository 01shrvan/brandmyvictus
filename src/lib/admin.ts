import type { AstroCookies } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

export const ADMIN_COOKIE = "bmv_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;

const signingKey = () => createHmac("sha256", SUPABASE_SERVICE_ROLE_KEY ?? "").update(`admin:${ADMIN_PASSWORD ?? ""}`).digest();

const sign = (value: string) => createHmac("sha256", signingKey()).update(value).digest("hex");

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const adminEnabled = () => Boolean(ADMIN_PASSWORD && ADMIN_PASSWORD.length >= 20 && SUPABASE_SERVICE_ROLE_KEY);

export const passwordMatches = (attempt: string) => {
  if (!adminEnabled()) return false;
  const a = createHmac("sha256", "compare").update(attempt).digest("hex");
  const b = createHmac("sha256", "compare").update(ADMIN_PASSWORD ?? "").digest("hex");
  return safeEqual(a, b);
};

export const startSession = (cookies: AstroCookies) => {
  const expires = Date.now() + SESSION_MS;
  const value = `${expires}.${sign(String(expires))}`;
  cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
};

export const endSession = (cookies: AstroCookies) => {
  cookies.delete(ADMIN_COOKIE, { path: "/" });
};

export const isAdmin = (cookies: AstroCookies) => {
  if (!adminEnabled()) return false;
  const raw = cookies.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [expires, signature] = raw.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
};

export const clientIp = (request: Request, clientAddress?: string) =>
  request.headers.get("x-real-ip") || clientAddress || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

export const hashIp = (ip: string) => createHmac("sha256", SUPABASE_SERVICE_ROLE_KEY ?? "").update(ip).digest("hex");

export const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};
