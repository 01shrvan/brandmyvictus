import type { APIRoute } from "astro";
import { clientIp, hashIp, sameOrigin } from "@/lib/admin";
import { isClosed, stepFor } from "@/lib/auction";
import { db } from "@/lib/db";
import { mailEnabled, mails, sendAll } from "@/lib/mail";
import { CORNER, spotById } from "@/lib/site";

export const prerender = false;

const MAX_BODY = 4096;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const field = (form: FormData, name: string, max: number) => {
  const value = form.get(name);
  return typeof value === "string" ? value.replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";
};

const normalizeUrl = (raw: string) => {
  const value = raw.trim();
  const handle = value.match(/^@([A-Za-z0-9_]{1,15})$/);
  const candidate = handle ? `https://x.com/${handle[1]}` : /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.port) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return null;
    url.hash = "";
    const out = url.toString();
    return out.length <= 200 ? out : null;
  } catch {
    return null;
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return json({ error: "bad request" }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "too large" }, 413);

  const client = db();
  if (!client) return json({ error: "bidding isnt open yet" }, 503);
  if (isClosed()) return json({ error: "the auction has closed" }, 409);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  if (field(form, "company", 100)) return json({ result: "pending" });

  const spotId = Number(field(form, "spotId", 4));
  const spot = Number.isInteger(spotId) ? spotById(spotId) : undefined;
  const amount = Number(field(form, "amount", 12));
  const brand = field(form, "brand", 40);
  const url = normalizeUrl(field(form, "url", 240));
  const email = field(form, "email", 200).toLowerCase();

  if (!spot) return json({ error: "that spot doesnt exist" }, 400);
  if (brand.length < 1 || brand.length > 40) return json({ error: "brand name should be 1 to 40 characters" }, 400);
  if (!url) return json({ error: "use a full https link, like yourbrand.com or @handle" }, 400);
  if (email.length > 200 || !EMAIL.test(email)) return json({ error: "that email doesnt look right" }, 400);

  const ipHash = hashIp(clientIp(request, clientAddress));

  if (spot.id === CORNER.id) {
    const { data, error } = await client.rpc("request_claim", {
      p_spot: CORNER.id,
      p_brand: brand,
      p_url: url,
      p_email: email,
      p_ip_hash: ipHash,
      p_start: spot.start,
      p_step: stepFor(spot),
    });
    if (error) return json({ error: "couldnt save that, try again" }, 500);
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.result === "rate_limited") return json({ error: "too many requests, try again in a few minutes" }, 429);
    if (row?.result !== "pending" || !row.bid_id) return json({ error: "couldnt save that, try again" }, 500);
    await sendAll([
      mails.adminClaim({ amount: row.amount, brand, url, email }),
      mails.claimReceived({ to: email, amount: row.amount, id: row.bid_id }),
    ]);
    return json({ result: "pending", amount: row.amount });
  }

  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    return json({ error: "bid should be a whole number of rupees" }, 400);
  }

  const { data, error } = await client.rpc("stage_bid", {
    p_spot: spot.id,
    p_amount: amount,
    p_brand: brand,
    p_url: url,
    p_email: email,
    p_ip_hash: ipHash,
    p_start: spot.start,
    p_step: stepFor(spot),
  });

  if (error) return json({ error: "couldnt place that bid, try again" }, 500);

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.result === "rate_limited") return json({ error: "too many bids from you, try again in a few minutes" }, 429);
  if (row?.result === "too_low") return json({ result: "too_low", min: row.next_min, max: row.max_amount }, 409);
  if (row?.result === "too_high") return json({ result: "too_high", min: row.next_min, max: row.max_amount }, 409);
  if (row?.result === "staged" && row.bid_id) {
    if (!mailEnabled()) return json({ error: "bidding is paused for a moment, try again shortly" }, 503);
    const [sent] = await sendAll([mails.confirmBid({ to: email, id: row.bid_id, spot: spot.label, amount })]);
    if (sent?.status !== "fulfilled" || !sent.value) return json({ error: "couldnt email you the confirm link, check the address" }, 502);
    return json({ result: "check_email" });
  }

  return json({ error: "couldnt place that bid, try again" }, 500);
};

export const ALL: APIRoute = () => json({ error: "method not allowed" }, 405);
