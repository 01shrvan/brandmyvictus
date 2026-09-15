import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { UUID, stickerResponse } from "@/lib/stickers";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? "";
  const client = db();
  if (!client || !UUID.test(id)) return new Response("not found", { status: 404 });

  const { data, error } = await client
    .from("bids")
    .select("sticker_path, approved, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.sticker_path || !data.approved || !["leading", "outbid"].includes(data.status)) {
    return new Response("not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
  }

  return stickerResponse(client, data.sticker_path, "public, max-age=3600, s-maxage=86400");
};
