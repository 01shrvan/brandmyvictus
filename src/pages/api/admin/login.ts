import type { APIRoute } from "astro";
import { adminEnabled, clientIp, hashIp, passwordMatches, sameOrigin, startSession } from "@/lib/admin";
import { db } from "@/lib/db";

export const prerender = false;

const back = (query = "") => new Response(null, { status: 303, headers: { location: `/admin${query}`, "cache-control": "no-store" } });

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const client = db();
  if (!adminEnabled() || !client || !sameOrigin(request)) return new Response("not found", { status: 404 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return back("?e=1");

  const ipHash = hashIp(clientIp(request, clientAddress));
  const { data: allowed, error } = await client.rpc("admin_login_allowed", { p_ip_hash: ipHash });
  if (error || allowed !== true) return back("?e=locked");

  let password = "";
  try {
    const form = await request.formData();
    const value = form.get("password");
    password = typeof value === "string" ? value.slice(0, 200) : "";
  } catch {
    return back("?e=1");
  }

  const ok = passwordMatches(password);
  await client.from("admin_attempts").insert({ ip_hash: ipHash, ok });
  await new Promise((resolve) => setTimeout(resolve, ok ? 0 : 800));

  if (!ok) return back("?e=1");
  startSession(cookies);
  return back();
};

export const ALL: APIRoute = () => new Response("method not allowed", { status: 405 });
