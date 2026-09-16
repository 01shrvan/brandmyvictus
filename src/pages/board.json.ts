import type { APIRoute } from "astro";
import { buildBoard, loadBoard, type Board } from "@/lib/auction";
import { AUCTION } from "@/lib/site";

export const prerender = false;

const shape = (board: Board) => ({
  connected: board.connected,
  closed: board.closed,
  spots: board.spots.length,
  taken: board.spots.filter((s) => s.leader).length,
  raised: board.raised,
  goal: AUCTION.goal,
  from: Math.min(...board.spots.map((s) => s.min)),
  days: Math.max(0, Math.ceil((new Date(AUCTION.closesAt).getTime() - Date.now()) / 86400000)),
});

export const GET: APIRoute = async () => {
  let board: Board;
  try {
    board = await loadBoard();
  } catch (error) {
    console.error("board feed load failed", error instanceof Error ? error.message : "unknown");
    board = buildBoard(false, []);
  }

  const fresh = board.connected ? 60 : 30;

  return new Response(JSON.stringify(shape(board)), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${fresh}, s-maxage=${fresh}, stale-while-revalidate=300`,
      "access-control-allow-origin": "*",
    },
  });
};
