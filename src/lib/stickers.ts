import type { SupabaseClient } from "@supabase/supabase-js";

export const STICKER_BUCKET = "stickers";

const TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;

export type StickerExt = keyof typeof TYPES;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, i) => bytes[offset + i] === value);

export const sniffSticker = (bytes: Uint8Array): StickerExt | null => {
  if (bytes.length < 16) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
};

export const contentTypeFor = (path: string) => {
  const ext = path.split(".").pop() as StickerExt;
  return TYPES[ext] ?? "application/octet-stream";
};

export const stickerResponse = async (client: SupabaseClient, path: string, cache: string) => {
  const { data, error } = await client.storage.from(STICKER_BUCKET).download(path);
  if (error || !data) return new Response("not found", { status: 404 });
  return new Response(await data.arrayBuffer(), {
    headers: {
      "content-type": contentTypeFor(path),
      "cache-control": cache,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    },
  });
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
