import type { APIRoute } from "astro";
import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { UUID, stickerResponse } from "@/lib/stickers";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  const id = params.id ?? "";
  const client = db();
  if (!isAdmin(cookies) || !client || !UUID.test(id)) return new Response("not found", { status: 404 });

  const { data } = await client.from("bids").select("sticker_path").eq("id", id).maybeSingle();
  if (!data?.sticker_path) return new Response("not found", { status: 404 });

  return stickerResponse(client, data.sticker_path, "private, no-store");
};
