import type { APIRoute } from "astro";
import { isAdmin, sameOrigin } from "@/lib/admin";
import { db } from "@/lib/db";
import { isClosed } from "@/lib/auction";
import { fetchLogo, removeLogo } from "@/lib/logo";
import { mails, sendAll } from "@/lib/mail";
import { ALL_SPOTS, CORNER } from "@/lib/site";
import { UUID } from "@/lib/stickers";
import { verifyAction } from "@/lib/tokens";

export const prerender = false;

const ACTIONS = new Set(["approve", "reject", "confirm", "delete", "logo", "unlogo", "notify_winners"]);

const spotLabel = (id: number) => ALL_SPOTS.find((s) => s.id === id)?.label ?? `spot ${id}`;

const back = (note: string) =>
  new Response(null, { status: 303, headers: { location: `/admin?done=${encodeURIComponent(note)}`, "cache-control": "no-store" } });

export const POST: APIRoute = async ({ request, cookies }) => {
  const client = db();
  if (!client || !sameOrigin(request)) return new Response("not found", { status: 404 });

  let id = "";
  let action = "";
  let token = "";
  try {
    const form = await request.formData();
    id = String(form.get("id") ?? "");
    action = String(form.get("action") ?? "");
    token = String(form.get("token") ?? "");
  } catch {
    return back("bad request");
  }
  if (!ACTIONS.has(action)) return back("bad request");

  const signedIn = isAdmin(cookies);
  const linkOk = Boolean(token) && UUID.test(id) && verifyAction(action, id, token);
  if (!signedIn && !linkOk) return new Response("not found", { status: 404 });

  if (action === "notify_winners") {
    if (!isClosed()) return back("the auction is still open");
    const { data: rows } = await client
      .from("bids")
      .select("id, spot_id, amount, email, winner_notified_at")
      .eq("approved", true)
      .in("status", ["leading", "outbid"])
      .neq("spot_id", CORNER.id);
    const best = new Map<number, { id: string; spot_id: number; amount: number; email: string; winner_notified_at: string | null }>();
    for (const row of rows ?? []) {
      const current = best.get(row.spot_id);
      if (!current || row.amount > current.amount) best.set(row.spot_id, row);
    }
    const pending = [...best.values()].filter((row) => !row.winner_notified_at);
    let sent = 0;
    for (const row of pending) {
      const [result] = await sendAll([mails.winner({ to: row.email, spot: spotLabel(row.spot_id), amount: row.amount, id: row.id })]);
      if (result?.status === "fulfilled" && result.value) {
        await client.from("bids").update({ winner_notified_at: new Date().toISOString() }).eq("id", row.id);
        sent += 1;
      }
    }
    return back(`emailed ${sent} of ${pending.length} winners`);
  }

  if (!UUID.test(id)) return back("bad request");

  const { data: bid } = await client.from("bids").select("id, url, status, email, spot_id").eq("id", id).maybeSingle();
  if (!bid) return back("bid not found");

  if (action === "approve") {
    const { data } = await client.rpc("approve_bid", { p_id: id });
    if (data !== "approved") return back("could not approve");
    const logo = await fetchLogo(client, id, bid.url);
    await sendAll([mails.approved({ to: bid.email, spot: spotLabel(bid.spot_id) })]);
    return back(logo ? "approved with logo" : "approved, no logo found");
  }

  if (action === "confirm") {
    const { data } = await client.rpc("confirm_claim", { p_id: id });
    if (data !== "confirmed") return back("could not confirm");
    const logo = await fetchLogo(client, id, bid.url);
    await sendAll([mails.claimLive({ to: bid.email })]);
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
