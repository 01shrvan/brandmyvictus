import { BREVO_API_KEY, UPI_ID } from "astro:env/server";
import { formatInr } from "@/lib/money";
import { AUCTION, SITE } from "@/lib/site";
import { actionUrl } from "@/lib/tokens";

export const MAIL_FROM = "victus@shrvan.xyz";

type Mail = { to: string; subject: string; lines: string[] };

const closeLabel = () =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(AUCTION.closesAt)).toLowerCase();

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const SITE_LINK = new RegExp(SITE.url.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&") + "[^\\s<]*", "g");

const ownLinks = (html: string) => html.replace(SITE_LINK, (url) => `<a href="${url}" style="color:#1c1f26">${url}</a>`);

const shortId = (id: string) => id.slice(0, 6);

export const mailEnabled = () => Boolean(BREVO_API_KEY);

const send = async ({ to, subject, lines }: Mail) => {
  if (!BREVO_API_KEY) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: controller.signal,
      headers: { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: SITE.name, email: MAIL_FROM },
        replyTo: { name: SITE.owner, email: SITE.email },
        to: [{ email: to }],
        subject,
        textContent: lines.join("\n\n"),
        htmlContent: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1c1f26;max-width:520px">${lines
          .map((line) => `<p>${ownLinks(escapeHtml(line))}</p>`)
          .join("")}</div>`,
        tags: ["brandmyvictus"],
      }),
    });
    if (!res.ok) console.error("mail send failed", res.status);
    return res.ok;
  } catch {
    console.error("mail send failed", "network");
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const sendAll = (mails: (Mail | null)[]) => Promise.allSettled(mails.filter((m): m is Mail => Boolean(m)).map(send));

const payLine = (amount: number, note: string) =>
  UPI_ID
    ? `pay ${formatInr(amount)} by upi to ${UPI_ID} with the note "${note}", then reply to this email with the payment screenshot.`
    : `reply to this email and i'll send you the payment details for ${formatInr(amount)}.`;

const safety = `i only ever email from ${MAIL_FROM} and only take payment to the upi id written in these emails. if anyone else asks you to pay for a spot, its a scam.`;

export const mails = {
  adminBid: (p: { id: string; spot: string; amount: number; brand: string; url: string; email: string }): Mail => ({
    to: SITE.email,
    subject: `new bid ${formatInr(p.amount)} on ${p.spot}`,
    lines: [
      `${p.brand} bid ${formatInr(p.amount)} on ${p.spot}. the name and logo are already showing, their link is not clickable yet.`,
      `link they gave: ${p.url}`,
      `bidder: ${p.email}`,
      `looks fine, make their link clickable: ${actionUrl(SITE.url, "approve", p.id)}`,
      `not fine, take it down: ${actionUrl(SITE.url, "reject", p.id)}`,
      `everything else: ${SITE.url}/admin`,
    ],
  }),

  adminClaim: (p: { amount: number; brand: string; url: string; email: string }): Mail => ({
    to: SITE.email,
    subject: `corner request ${formatInr(p.amount)}`,
    lines: [
      `${p.brand} wants the corner for ${formatInr(p.amount)}. it stays hidden until you confirm they paid.`,
      `link they gave: ${p.url}`,
      `requester: ${p.email}`,
      `confirm it once the money lands: ${SITE.url}/admin`,
    ],
  }),

  bidPlaced: (p: { to: string; spot: string; amount: number }): Mail => ({
    to: p.to,
    subject: `your bid on ${p.spot} is in`,
    lines: [
      `your bid of ${formatInr(p.amount)} on the ${p.spot} spot is in.`,
      `your name and logo are on the spot already. your link becomes clickable once i check it, usually within a day. you'll get an email if someone outbids you. bidding closes ${closeLabel()}.`,
      `no payment now. you only pay if you win.`,
      `didn't place this bid? ignore this email, nothing happens.`,
      `${SITE.url}`,
    ],
  }),

  outbid: (p: { to: string; spot: string; amount: number; next: number }): Mail => ({
    to: p.to,
    subject: `you've been outbid on ${p.spot}`,
    lines: [
      `someone bid ${formatInr(p.amount)} on the ${p.spot} spot.`,
      `you can take it back from ${formatInr(p.next)} until ${closeLabel()}.`,
      `${SITE.url}/#spots`,
    ],
  }),

  approved: (p: { to: string; spot: string }): Mail => ({
    to: p.to,
    subject: `your link is live on ${p.spot}`,
    lines: [
      `checked and cleared. your logo and your link are both live on the ${p.spot} spot at ${SITE.url}`,
      `if the logo came out wrong, reply with a png and i'll swap it.`,
    ],
  }),

  claimReceived: (p: { to: string; amount: number; id: string }): Mail => ({
    to: p.to,
    subject: `your corner request`,
    lines: [
      `thanks for requesting the corner on ${SITE.name}.`,
      payLine(p.amount, `corner ${shortId(p.id)}`),
      `it goes live as soon as i confirm the payment. if someone confirms a higher corner payment first, i refund you in full.`,
      safety,
    ],
  }),

  claimLive: (p: { to: string }): Mail => ({
    to: p.to,
    subject: `you're live in the corner`,
    lines: [`payment confirmed, you're now in the corner at the top of ${SITE.url}`],
  }),

  winner: (p: { to: string; spot: string; amount: number; id: string }): Mail => ({
    to: p.to,
    subject: `you won ${p.spot} on ${SITE.name}`,
    lines: [
      `you won the ${p.spot} spot at ${formatInr(p.amount)}.`,
      payLine(p.amount, `victus ${shortId(p.id)}`),
      `please pay within 72 hours, after that the spot goes to the next highest bid. once paid, i get your sticker printed and post a photo when it goes on.`,
      safety,
    ],
  }),
};
