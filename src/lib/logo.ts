import type { SupabaseClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { STICKER_BUCKET, sniffSticker, type StickerExt } from "@/lib/stickers";

const TIMEOUT_MS = 5000;
const MAX_HTML = 512 * 1024;
const MAX_IMAGE = 1024 * 1024;
const MIN_PNG_SIZE = 64;
const USER_AGENT = "brandmyvictus-logo/1.0 (+https://victus.shrvan.xyz)";
const CONTENT_TYPES: Record<StickerExt, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const privateV4 = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const privateV6 = (ip: string) => {
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return privateV4(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
};

const isPublicHost = async (host: string) => {
  if (isIP(host)) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => (a.family === 4 ? !privateV4(a.address) : !privateV6(a.address)));
  } catch {
    return false;
  }
};

type Fetched = { bytes: Uint8Array; type: string; url: string };

const safeFetch = async (raw: string, accept: string, max: number, hops = 3): Promise<Fetched | null> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  if (!(await isPublicHost(url.hostname))) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { accept, "user-agent": USER_AGENT },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hops <= 0) return null;
      return await safeFetch(new URL(location, url).toString(), accept, max, hops - 1);
    }
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > max) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        controller.abort();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, type: res.headers.get("content-type") ?? "", url: url.toString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];

const iconsFromHtml = (html: string, base: string) =>
  [...html.slice(0, MAX_HTML).matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => {
      const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
      const href = attr(tag, "href");
      const type = attr(tag, "type") ?? "";
      if (!href || /\.svg(\?|$)/i.test(href) || type.includes("svg")) return null;
      const size = Math.max(0, ...(attr(tag, "sizes") ?? "").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));
      const score = rel.some((r) => r.startsWith("apple-touch-icon")) ? 1000 + size : rel.includes("icon") ? 100 + size : -1;
      if (score < 0) return null;
      try {
        return { href: new URL(href, base).toString(), score };
      } catch {
        return null;
      }
    })
    .filter((x): x is { href: string; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.href);

const candidatesFor = async (siteUrl: string) => {
  const url = new URL(siteUrl);
  if (url.hostname === "x.com" || url.hostname === "twitter.com") {
    const handle = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? [`https://unavatar.io/x/${handle}?fallback=false`] : [];
  }
  const list: string[] = [];
  const page = await safeFetch(url.toString(), "text/html", MAX_HTML);
  if (page && page.type.includes("html")) list.push(...iconsFromHtml(new TextDecoder().decode(page.bytes), page.url));
  list.push(`${url.origin}/apple-touch-icon.png`, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=256`);
  return [...new Set(list)].slice(0, 6);
};

const pngWidth = (bytes: Uint8Array) => (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];

export const fetchLogo = async (client: SupabaseClient, bidId: string, siteUrl: string) => {
  let candidates: string[];
  try {
    candidates = await candidatesFor(siteUrl);
  } catch {
    return null;
  }

  for (const candidate of candidates) {
    const image = await safeFetch(candidate, "image/png,image/webp,image/jpeg;q=0.8", MAX_IMAGE);
    if (!image) continue;
    const ext = sniffSticker(image.bytes);
    if (!ext) continue;
    if (ext === "png" && pngWidth(image.bytes) < MIN_PNG_SIZE) continue;

    const path = `${bidId}.${ext}`;
    const { error } = await client.storage
      .from(STICKER_BUCKET)
      .upload(path, image.bytes, { contentType: CONTENT_TYPES[ext], upsert: true, cacheControl: "3600" });
    if (error) continue;

    const { data: existing } = await client.from("bids").select("sticker_path").eq("id", bidId).maybeSingle();
    if (existing?.sticker_path && existing.sticker_path !== path) {
      await client.storage.from(STICKER_BUCKET).remove([existing.sticker_path]);
    }
    const { error: updateError } = await client.from("bids").update({ sticker_path: path }).eq("id", bidId);
    return updateError ? null : path;
  }
  return null;
};

export const removeLogo = async (client: SupabaseClient, bidId: string) => {
  const { data } = await client.from("bids").select("sticker_path").eq("id", bidId).maybeSingle();
  if (!data?.sticker_path) return;
  await client.storage.from(STICKER_BUCKET).remove([data.sticker_path]);
  await client.from("bids").update({ sticker_path: null }).eq("id", bidId);
};
