import { db } from "@/lib/db";
import { AUCTION, CORNER, SPOTS, type Spot } from "@/lib/site";

export type Bid = {
  id: string;
  spotId: number;
  amount: number;
  brand: string;
  url: string | null;
  sticker: string | null;
  approved: boolean;
  status: "leading" | "outbid";
  createdAt: string;
  liveAt: string | null;
};

export type SpotState = Spot & {
  leader: Bid | null;
  bids: number;
  min: number;
};

export type Board = {
  connected: boolean;
  spots: SpotState[];
  corner: SpotState;
  cornerHistory: Bid[];
  recent: Bid[];
  raised: number;
  totalBids: number;
  closed: boolean;
};

export const IN_REVIEW = "in review";

export const stepFor = (spot: Spot) => (spot.id === CORNER.id ? AUCTION.cornerStep : AUCTION.step);

export const minFor = (spot: Spot, leader: Bid | null) => (leader ? leader.amount + stepFor(spot) : spot.start);

export const isClosed = (now = Date.now()) => now >= new Date(AUCTION.closesAt).getTime();

export const loadBids = async (): Promise<{ connected: boolean; bids: Bid[] }> => {
  const client = db();
  if (!client) return { connected: false, bids: [] };

  const { data, error } = await client
    .from("bids")
    .select("id, spot_id, amount, brand, url, sticker_path, status, approved, created_at, live_at")
    .in("status", ["leading", "outbid"])
    .order("created_at", { ascending: false });

  if (error) throw new Error(`bids query failed: ${error.message}`);

  return {
    connected: true,
    bids: (data ?? []).map((row) => ({
      id: row.id,
      spotId: row.spot_id,
      amount: row.amount,
      brand: row.approved ? row.brand : IN_REVIEW,
      url: row.approved ? row.url : null,
      sticker: row.approved && row.sticker_path ? `/api/sticker/${row.id}` : null,
      approved: row.approved,
      status: row.status,
      createdAt: row.created_at,
      liveAt: row.live_at,
    })),
  };
};

export const buildBoard = (connected: boolean, bids: Bid[]): Board => {
  const closed = isClosed();
  const stateFor = (spot: Spot): SpotState => {
    const mine = bids.filter((b) => b.spotId === spot.id);
    const current = mine.find((b) => b.status === "leading") ?? null;
    const winner = mine.filter((b) => b.approved).sort((a, b) => b.amount - a.amount)[0] ?? null;
    const leader = closed ? winner : current;
    return { ...spot, leader, bids: mine.length, min: minFor(spot, current) };
  };

  const spots = SPOTS.map(stateFor);
  const auctionBids = bids.filter((b) => b.spotId !== CORNER.id);

  return {
    connected,
    spots,
    corner: stateFor(CORNER),
    cornerHistory: bids
      .filter((b) => b.spotId === CORNER.id)
      .sort((a, b) => (b.liveAt ?? b.createdAt).localeCompare(a.liveAt ?? a.createdAt))
      .slice(0, 5),
    recent: auctionBids.slice(0, 8),
    raised:
      spots.reduce((sum, s) => sum + (s.leader?.approved ? s.leader.amount : 0), 0) +
      bids.filter((b) => b.spotId === CORNER.id && b.approved).reduce((sum, b) => sum + b.amount, 0),
    totalBids: auctionBids.length,
    closed,
  };
};

export const loadBoard = async () => {
  const { connected, bids } = await loadBids();
  return buildBoard(connected, bids);
};
