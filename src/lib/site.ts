export const SITE = {
  name: "brand my victus",
  owner: "shrvan benke",
  aka: "astra",
  url: "https://victus.shrvan.xyz",
  home: "https://www.shrvan.xyz",
  x: "https://x.com/01shrvan",
  email: "benkeshrvan@gmail.com",
  location: "mumbai, india",
  description:
    "an auction for the sticker spots on my hp victus. your logo rides along to every cafe, meetup and screen recording.",
} as const;

export const AUCTION = {
  step: 100,
  cornerStart: 99,
  cornerStep: 50,
  goal: 74990,
  usdRate: 88,
  closesAt: "2026-10-31T23:59:59+05:30",
} as const;

export type Zone = "lid" | "deck" | "brick" | "web";
export type Size = "s" | "m" | "l";

export type Spot = {
  id: number;
  zone: Zone;
  label: string;
  size: Size;
  w: number;
  h: number;
  x: number;
  y: number;
  start: number;
};

export const CORNER: Spot = {
  id: 0,
  zone: "web",
  label: "the corner, top of this page",
  size: "s",
  w: 0,
  h: 0,
  x: 0,
  y: 0,
  start: AUCTION.cornerStart,
};

export const LID = { w: 357.9, h: 255 } as const;

export const PHOTOS = {
  credit: "OhanaUnited",
  license: "cc by-sa 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  lid: { src: "/photos/lid.webp", source: "https://commons.wikimedia.org/wiki/File:HP_Victus_laptop.jpg" },
  deck: { src: "/photos/deck.webp", source: "https://commons.wikimedia.org/wiki/File:HP_Victus_laptop_2.jpg" },
} as const;

export const SPOTS: Spot[] = [
  { id: 1, zone: "lid", label: "marquee above the V", size: "l", w: 120, h: 40, x: 118.95, y: 30, start: 2499 },
  { id: 2, zone: "lid", label: "top left", size: "l", w: 90, h: 55, x: 16, y: 16, start: 1999 },
  { id: 3, zone: "lid", label: "top right", size: "l", w: 90, h: 55, x: 251.9, y: 16, start: 1999 },
  { id: 4, zone: "lid", label: "left of the V", size: "m", w: 60, h: 60, x: 60, y: 90, start: 999 },
  { id: 5, zone: "lid", label: "right of the V", size: "m", w: 60, h: 60, x: 237.9, y: 90, start: 999 },
  { id: 6, zone: "lid", label: "bottom left", size: "l", w: 90, h: 55, x: 16, y: 170, start: 1499 },
  { id: 7, zone: "lid", label: "bottom right", size: "l", w: 90, h: 55, x: 251.9, y: 170, start: 1499 },
  { id: 8, zone: "lid", label: "marquee above the hinge", size: "l", w: 120, h: 40, x: 118.95, y: 184, start: 1999 },
  { id: 9, zone: "deck", label: "left palm rest", size: "s", w: 40, h: 40, x: 30, y: 186, start: 299 },
  { id: 10, zone: "deck", label: "right palm rest", size: "s", w: 40, h: 40, x: 242, y: 186, start: 299 },
  { id: 11, zone: "brick", label: "charger brick", size: "m", w: 90, h: 45, x: 30, y: 20, start: 599 },
];

export const ALL_SPOTS: Spot[] = [CORNER, ...SPOTS];

export const spotById = (id: number) => ALL_SPOTS.find((s) => s.id === id);

export const MACHINE = [
  { label: "laptop", value: "hp victus 15, black" },
  { label: "lid", value: "35.8 × 25.5 cm, one small logo, the rest is yours" },
  { label: "seen at", value: "cafes, meetups, college, video calls, screen recordings" },
] as const;

export const STEPS = [
  {
    title: "pick a spot",
    note: "eleven spots on the lid, the deck and the charger brick. bigger and more visible costs more. every spot is plotted to scale on the drawing above",
  },
  {
    title: "bid on it",
    note: `your name and logo land on the spot straight away, pulled from your link. anyone can outbid you by ₹${AUCTION.step} or more until it closes. no card needed`,
  },
  {
    title: "your sticker rides along",
    note: "when it closes i message the winners, you pay by upi or card, i print a die cut vinyl sticker and put it on. it stays there while the laptop goes everywhere with me",
  },
] as const;

export const FAQ = [
  {
    q: "is this real",
    a: "yes. real laptop, real vinyl stickers, real person carrying it around mumbai. every sticker goes up on x with a photo when it lands on the lid",
  },
  {
    q: "why a victus and not a macbook",
    a: "a macbook lid already has the most famous logo in the world on it, so your sticker is fighting the apple. my lid has one small V that nobody looks twice at. yours is the thing people actually read",
  },
  {
    q: "what do i get",
    a: "a die cut vinyl sticker on the spot you won, applied by me. plus your logo and link on this page for as long as the sticker stays on. the logo comes from your own link, send me a png if you want a different one",
  },
  {
    q: "do i pay when i bid",
    a: "no. bids are free to place and show up straight away with your logo. your link becomes clickable once i check it. if you win, i email you after the auction closes with how to pay. if you dont pay within 72 hours the spot goes to the next highest bid",
  },
  {
    q: "can i get outbid",
    a: `yes, until the auction closes. the next bid has to be at least ₹${AUCTION.step} higher. your bid stays in the history either way`,
  },
  {
    q: "will you take any brand",
    a: "no. i check every bid by hand. no gambling, no crypto pumps, nothing adult, nothing i wouldnt want next to my name. fake or joke bids get removed and the previous bid is restored",
  },
  {
    q: "what is the corner",
    a: `a small spotlight at the very top of this page. it is not an auction, you just pay the current price and its yours until someone pays ₹${AUCTION.cornerStep} more. it shows up once i confirm the payment`,
  },
  {
    q: "what happens to the money",
    a: `it pays back what the laptop cost me, ₹${AUCTION.goal.toLocaleString("en-IN")}. anything above that goes into building in public, domains, servers and coffee for the cafes where the stickers get seen`,
  },
  {
    q: "how do i know a message is really from you",
    a: `auction emails only come from victus@shrvan.xyz and replies go to ${SITE.email}. i never ask for otps or passwords, and payment details only ever come in those emails. if anyone else messages you about a spot, its a scam, report it to me`,
  },
] as const;
