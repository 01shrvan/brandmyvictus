import type { APIRoute } from "astro";
import { isAdmin, sameOrigin } from "@/lib/admin";
import { db } from "@/lib/db";
import { fetchLogo, removeLogo } from "@/lib/logo";
import { UUID } from "@/lib/stickers";

export const prerender = false;

const ACTIONS = new Set(["approve", "reject", "confirm", "delete", "logo", "unlogo"]);

const back = (note: string) =>
  new Response(null, { status: 303, headers: { location: `/admin?done=${encodeURIComponent(note)}`, "cache-control": "no-store" } });

export const POST: APIRoute = async ({ request, cookies }) => {
  const client = db();
  if (!client || !isAdmin(cookies) || !sameOrigin(request)) return new Response("not found", { status: 404 });

  let id = "";
  let action = "";
  try {
    const form = await request.formData();
    id = String(form.get("id") ?? "");
    action = String(form.get("action") ?? "");
  } catch {
    return back("bad request");
  }
  if (!UUID.test(id) || !ACTIONS.has(action)) return back("bad request");

  const { data: bid } = await client.from("bids").select("id, url, status").eq("id", id).maybeSingle();
  if (!bid) return back("bid not found");

  if (action === "approve") {
    const { data } = await client.rpc("approve_bid", { p_id: id });
    if (data !== "approved") return back("could not approve");
    const logo = await fetchLogo(client, id, bid.url);
    return back(logo ? "approved with logo" : "approved, no logo found");
  }

  if (action === "confirm") {
    const { data } = await client.rpc("confirm_claim", { p_id: id });
    if (data !== "confirmed") return back("could not confirm");
    const logo = await fetchLogo(client, id, bid.url);
    return back(logo ? "corner confirmed with logo" : "corner confirmed, no logo found");
  }

  if (action === "reject") {
    const { data } = await client.rpc("reject_bid", { p_id: id });
    await removeLogo(client, id);
    return back(data === "restored" ? "rejected, previous bid restored" : "rejected");
  }

  if (action === "logo") {
    const logo = await fetchLogo(client, id, bid.url);
    return back(logo ? "logo refreshed" : "no logo found");
  }

  if (action === "unlogo") {
    await removeLogo(client, id);
    return back("logo removed, brand name shows instead");
  }

  if (bid.status === "leading") return back("reject a leading bid before deleting it");
  await removeLogo(client, id);
  await client.from("bids").delete().eq("id", id);
  return back("deleted");
};

export const ALL: APIRoute = () => new Response("method not allowed", { status: 405 });
