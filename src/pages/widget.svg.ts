import type { APIRoute } from "astro";
import css from "@/styles/app.css?raw";
import sans from "@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?inline";
import mono from "@fontsource-variable/martian-mono/files/martian-mono-latin-wght-normal.woff2?inline";
import { buildBoard, loadBoard, type Board } from "@/lib/auction";
import { formatInr } from "@/lib/money";
import { AUCTION, LID, SITE } from "@/lib/site";

export const prerender = false;

const W = 320;
const H = 326;
const PAD = 20;
const RIGHT = W - PAD;
const TOP = 48;
const SCALE = (W - PAD * 2) / LID.w;

const tokens = [...css.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)]
  .map(([, name, value]) => `--color-${name}:${value.trim()};`)
  .join("");

const LIGHT =
  "--card:var(--color-ground);--edge:var(--color-line);--fg:var(--color-ink);--mute:var(--color-ink-dim)";
const DARK =
  "--card:var(--color-lid-key);--edge:var(--color-lid-edge);--fg:var(--color-on-lid);--mute:var(--color-on-lid-dim)";

const palette = (theme: string | null) => {
  if (theme === "dark") return `svg{${tokens}${DARK}}`;
  if (theme === "light") return `svg{${tokens}${LIGHT}}`;
  return `svg{${tokens}${LIGHT}}@media(prefers-color-scheme:dark){svg{${DARK}}}`;
};

const host = new URL(SITE.url).host;
const n = (value: number) => Number(value.toFixed(2));

const render = (board: Board, theme: string | null) => {
  const spots = board.spots.length;
  const taken = board.spots.filter((s) => s.leader).length;
  const from = Math.min(...board.spots.map((s) => s.min));
  const days = Math.max(0, Math.ceil((new Date(AUCTION.closesAt).getTime() - Date.now()) / 86400000));

  const headline = !board.connected
    ? "opens soon"
    : board.raised > 0
      ? formatInr(board.raised)
      : "no bids yet";

  const status = board.closed ? "closed" : `${days}d left`;

  const plots = board.spots
    .filter((s) => s.zone === "lid")
    .map(
      (s) =>
        `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="5" class="${s.leader ? "taken" : "open"}"/>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t">
<title id="t">${SITE.name}, ${headline}, ${taken} of ${spots} spots taken, ${status}</title>
<style>
@font-face{font-family:s;src:url(${sans}) format("woff2");font-weight:100 900}
@font-face{font-family:m;src:url(${mono}) format("woff2");font-weight:100 900}
${palette(theme)}
.card{fill:var(--card);stroke:var(--edge)}
.lid{fill:var(--color-lid);stroke:var(--color-lid-edge);stroke-width:1;vector-effect:non-scaling-stroke}
.v{fill:none;stroke:var(--color-on-lid-dim);stroke-width:6;opacity:.4}
.open{fill:var(--color-plot-fill);stroke:var(--color-on-lid-dim);stroke-width:1;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.taken{fill:var(--color-vinyl)}
.sans{font-family:s,system-ui,sans-serif}
.mono{font-family:m,ui-monospace,monospace;font-variant-numeric:tabular-nums}
.fg{fill:var(--fg)}
.mute{fill:var(--mute)}
.live{fill:var(--color-${board.closed || !board.connected ? "ink-dim" : "signal"})}
</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="22" class="card"/>
<circle cx="${PAD + 3}" cy="29" r="3" class="live"/>
<text x="${PAD + 13}" y="32" font-size="8.5" letter-spacing="1.5" class="mono mute">${SITE.name.toUpperCase()}</text>
<g transform="translate(${PAD} ${TOP}) scale(${n(SCALE)})">
<rect width="${LID.w}" height="${LID.h}" rx="12" class="lid"/>
<path d="M 160 100 L 178.95 150 L 197.9 100" class="v"/>
${plots}
</g>
<text x="${PAD}" y="285" font-size="26" font-weight="600" letter-spacing="-.4" class="sans fg">${headline}</text>
<text x="${RIGHT}" y="285" font-size="9.5" text-anchor="end" class="mono mute">${status}</text>
<text x="${PAD}" y="306" font-size="9.5" class="mono mute">${taken} of ${spots} taken · from ${formatInr(from)}</text>
<text x="${RIGHT}" y="306" font-size="9" text-anchor="end" class="mono mute">${host}</text>
</svg>`;
};

export const GET: APIRoute = async ({ request }) => {
  let board: Board;
  try {
    board = await loadBoard();
  } catch (error) {
    console.error("widget board load failed", error instanceof Error ? error.message : "unknown");
    board = buildBoard(false, []);
  }

  const theme = new URL(request.url).searchParams.get("theme");
  const fresh = board.connected ? 300 : 60;

  return new Response(render(board, theme), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": `public, max-age=${fresh}, s-maxage=${fresh}, stale-while-revalidate=600`,
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; font-src data:",
    },
  });
};
