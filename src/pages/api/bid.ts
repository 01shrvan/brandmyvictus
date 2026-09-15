import type { APIRoute } from "astro";
import { isClosed, minFor, stepFor, type Bid } from "@/lib/auction";
import { db } from "@/lib/db";
import { CORNER, spotById } from "@/lib/site";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normalizeUrl = (raw: string) => {
  const value = raw.trim();
  const handle = value.match(/^@([A-Za-z0-9_]{1,15})$/);
  const candidate = handle ? `https://x.com/${handle[1]}` : /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    const out = url.toString();
    return out.length <= 200 ? out : null;
  } catch {
    return null;
  }
};

export const POST: APIRoute = async ({ request }) => {
  const client = db();
  if (!client) return json({ error: "bidding isnt connected yet" }, 503);
  if (isClosed()) return json({ error: "the auction has closed" }, 409);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  if (typeof body.company === "string" && body.company.length > 0) {
    return json({ result: "pending" });
  }

  const spot = spotById(Number(body.spotId));
  const amount = Number(body.amount);
  const brand = typeof body.brand === "string" ? body.brand.trim().replace(/\s+/g, " ") : "";
  const url = typeof body.url === "string" ? normalizeUrl(body.url) : null;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!spot) return json({ error: "that spot doesnt exist" }, 400);
  if (brand.length < 1 || brand.length > 40) return json({ error: "brand name should be 1 to 40 characters" }, 400);
  if (!url) return json({ error: "that link doesnt look right" }, 400);
  if (email.length > 200 || !EMAIL.test(email)) return json({ error: "that email doesnt look right" }, 400);

  if (spot.id === CORNER.id) {
    const { data: lead, error: leadError } = await client
      .from("bids")
      .select("amount")
      .eq("spot_id", CORNER.id)
      .eq("status", "leading")
      .maybeSingle();
    if (leadError) return json({ error: "couldnt read the corner, try again" }, 500);

    const price = minFor(spot, lead ? ({ amount: lead.amount } as Bid) : null);
    const { error } = await client.from("bids").insert({
      spot_id: CORNER.id,
      amount: price,
      brand,
      url,
      email,
      status: "pending",
    });
    if (error) return json({ error: "couldnt save that, try again" }, 500);
    return json({ result: "pending", amount: price });
  }

  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    return json({ error: "bid should be a whole number of rupees" }, 400);
  }

  const { data, error } = await client.rpc("place_bid", {
    p_spot: spot.id,
    p_amount: amount,
    p_brand: brand,
    p_url: url,
    p_email: email,
    p_start: spot.start,
    p_step: stepFor(spot),
  });

  if (error) return json({ error: "couldnt place that bid, try again" }, 500);

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.result === "too_low") return json({ result: "too_low", min: row.next_min }, 409);
  if (row?.result === "leading") return json({ result: "leading", next: row.next_min });

  return json({ error: "couldnt place that bid, try again" }, 500);
};
