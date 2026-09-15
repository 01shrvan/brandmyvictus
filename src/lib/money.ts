import { AUCTION } from "@/lib/site";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatInr = (amount: number) => `₹${inr.format(amount)}`;
export const formatUsd = (amount: number) => `$${usd.format(Math.max(1, Math.round(amount / AUCTION.usdRate)))}`;
