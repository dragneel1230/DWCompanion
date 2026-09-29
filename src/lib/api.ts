// External APIs. Requests go through the Tauri HTTP plugin (Rust side), so no CORS issues.
import { fetch } from "@tauri-apps/plugin-http";

const WFM = "https://api.warframe.market/v2";
const WFSTAT = "https://api.warframestat.us/pc";

// ---------- warframe.market prices

export interface Price {
  sell: number | null; // cheapest online seller
  buy: number | null; // best online buyer
  sellers: number;
  at: number;
}

interface WfmOrder {
  type: "sell" | "buy";
  platinum: number;
  user: { status: "ingame" | "online" | "offline" };
}

const PRICE_TTL = 5 * 60_000;
const prices = new Map<string, Price>();
const inflight = new Map<string, Promise<Price | null>>();

// warframe.market asks clients to stay around 3 requests per second.
// Space out request starts, but let responses overlap.
const MIN_GAP = 340;
let nextStart = 0;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const start = Math.max(now, nextStart);
  nextStart = start + MIN_GAP;
  if (start > now) await new Promise((r) => setTimeout(r, start - now));
  return fn();
}

export function cachedPrice(slug: string): Price | null {
  const p = prices.get(slug);
  return p && Date.now() - p.at < PRICE_TTL ? p : null;
}

export function getPrice(slug: string): Promise<Price | null> {
  const cached = cachedPrice(slug);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(slug);
  if (pending) return pending;

  const p = throttled(async () => {
    const res = await fetch(`${WFM}/orders/item/${slug}/top`, { headers: { platform: "pc", crossplay: "true" } });
    if (!res.ok) return null;
    const data = (await res.json()).data as { sell: WfmOrder[]; buy: WfmOrder[] };
    const online = (o: WfmOrder) => o.user.status !== "offline";
    const sells = data.sell.filter(online).map((o) => o.platinum).sort((a, b) => a - b);
    const buys = data.buy.filter(online).map((o) => o.platinum).sort((a, b) => b - a);
    const price: Price = { sell: sells[0] ?? null, buy: buys[0] ?? null, sellers: sells.length, at: Date.now() };
    prices.set(slug, price);
    return price;
  }).finally(() => inflight.delete(slug));

  inflight.set(slug, p);
  return p;
}

// ---------- world state

export interface Fissure {
  id: string;
  node: string;
  missionType: string;
  enemy: string;
  tier: string;
  tierNum: number;
  expiry: string;
  isStorm: boolean;
  isHard: boolean;
}

export async function getFissures(): Promise<Fissure[]> {
  const res = await fetch(`${WFSTAT}/fissures`);
  if (!res.ok) throw new Error(`warframestat ${res.status}`);
  return (await res.json()) as Fissure[];
}

// ---------- warframe.market: all orders of an item

export type UserStatus = "ingame" | "online" | "offline";

export interface Order {
  id: string;
  type: "sell" | "buy";
  platinum: number;
  quantity: number;
  rank?: number;
  subtype?: string;
  updatedAt: string;
  user: {
    ingameName: string;
    slug: string;
    reputation: number;
    status: UserStatus;
    locale: string;
    lastSeen?: string;
  };
}

const ORDERS_TTL = 60_000;
const orders = new Map<string, { at: number; list: Order[] }>();

export async function getOrders(slug: string, fresh = false): Promise<Order[]> {
  const cached = orders.get(slug);
  if (!fresh && cached && Date.now() - cached.at < ORDERS_TTL) return cached.list;
  const list = await throttled(async () => {
    const res = await fetch(`${WFM}/orders/item/${slug}`, { headers: { platform: "pc", crossplay: "true" } });
    if (!res.ok) throw new Error(`warframe.market ${res.status}`);
    return ((await res.json()).data as Order[]).filter((o) => (o as Order & { visible?: boolean }).visible !== false);
  });
  orders.set(slug, { at: Date.now(), list });
  return list;
}
