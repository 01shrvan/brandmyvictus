import type { APIRoute } from "astro";
import { sameOrigin } from "@/lib/admin";
import { isClosed, stepFor } from "@/lib/auction";
import { db } from "@/lib/db";
import { fetchLogo } from "@/lib/logo";
import { mails, sendAll } from "@/lib/mail";
import { AUCTION, spotById } from "@/lib/site";
import { UUID } from "@/lib/stickers";
import { verifyAction } from "@/lib/tokens";

export const prerender = false;

const back = (note: string, id = "", token = "") =>
  new Response(null, {
    status: 303,
    headers: { location: id ? `/do/confirm/${id}/${token}?done=${encodeURIComponent(note)}` : `/?done=${encodeURIComponent(note)}`, "cache-control": "no-store" },
  });

export const POST: APIRoute = async ({ request }) => {
  const client = db();
  if (!client || !sameOrigin(request)) return new Response("not found", { status: 404 });

  let id = "";
  let token = "";
  try {
    const form = await request.formData();
    id = String(form.get("id") ?? "");
    token = String(form.get("token") ?? "");
  } catch {
    return back("that link didnt work");
  }

  if (!UUID.test(id) || !verifyAction("confirm", id, token)) return new Response("not found", { status: 404 });
  if (isClosed()) return back("the auction has closed", id, token);

  const { data: staged } = await client.from("bids").select("spot_id").eq("id", id).maybeSingle();
  const spot = staged ? spotById(staged.spot_id) : undefined;
  if (!spot) return back("that bid is gone", id, token);

  const { data, error } = await client.rpc("confirm_bid", { p_id: id, p_start: spot.start, p_step: stepFor(spot) });
  if (error) return back("couldnt confirm that, try again", id, token);

  const row = Array.isArray(data) ? data[0] : data;

  if (row?.result === "leading") {
    await fetchLogo(client, id, row.url);
    await sendAll([
      mails.adminBid({ id, spot: spot.label, amount: row.amount, brand: row.brand, url: row.url, email: row.email }),
      row.outbid_email ? mails.outbid({ to: row.outbid_email, spot: spot.label, amount: row.amount, next: row.amount + AUCTION.step }) : null,
    ]);
    return back("confirmed, your bid is live", id, token);
  }

  if (row?.result === "too_low") return back(`someone got there first, the minimum is now ${row.next_min}`, id, token);
  if (row?.result === "expired") return back("that link expired, place the bid again", id, token);
  return back("that bid is already confirmed or gone", id, token);
};

export const ALL: APIRoute = () => new Response("method not allowed", { status: 405 });
