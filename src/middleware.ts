import { defineMiddleware } from "astro:middleware";

const HEADERS: Record<string, string> = {
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "cross-origin-opener-policy": "same-origin",
};

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  for (const [name, value] of Object.entries(HEADERS)) {
    if (name === "content-security-policy") {
      if (import.meta.env.DEV) continue;
      const existing = response.headers.get(name);
      response.headers.set(name, existing ? `${existing.replace(/;\s*$/, "")}; ${value}` : value);
      continue;
    }
    response.headers.set(name, value);
  }
  return response;
});
