import type { APIRoute } from "astro";
import { endSession, sameOrigin } from "@/lib/admin";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request)) return new Response("forbidden", { status: 403 });
  endSession(cookies);
  return new Response(null, { status: 303, headers: { location: "/admin", "cache-control": "no-store" } });
};

export const ALL: APIRoute = () => new Response("method not allowed", { status: 405 });
