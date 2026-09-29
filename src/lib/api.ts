// External APIs. Requests go through the Tauri HTTP plugin (Rust side), so no CORS issues.
import { fetch } from "@tauri-apps/plugin-http";
import { getDb } from "./db";

const WFM = "https://api.warframe.market/v2";
const WORLDSTATE = "https://api.warframe.com/cdn/worldState.php";

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

// Official worldState (the same public file the game and warframestat.us read).
// Names are resolved to Russian here via db.world.
export interface Fissure {
  id: string;
  node: string;
  mission: string;
  enemy: string;
  tier: string;
  tierNum: number;
  expiry: number;
  isStorm: boolean;
  isHard: boolean;
}

interface WsMission {
  _id: { $oid: string };
  Node: string;
  Expiry: { $date: { $numberLong: string } };
  MissionType?: string; // fissures only
  Modifier?: string; // fissures: VoidT1..VoidT6
  ActiveMissionTier?: string; // Void Storms
  Hard?: boolean;
}

type WsDate = { $date: { $numberLong: string } };
const ms = (d: WsDate | undefined) => (d ? Number(d.$date.$numberLong) : 0);

interface WorldState {
  ActiveMissions?: WsMission[];
  VoidStorms?: WsMission[];
  SyndicateMissions?: { Tag: string; Activation: WsDate; Expiry: WsDate }[];
  VoidTraders?: { Activation: WsDate; Expiry: WsDate; Node: string }[];
  PrimeVaultTraders?: { Activation: WsDate; Expiry: WsDate; Manifest?: { ItemType: string }[] }[];
}

// One request serves every page for a short while (the file is ~140 KB).
let wsCache: { at: number; p: Promise<WorldState> } | null = null;
function worldState(): Promise<WorldState> {
  if (!wsCache || Date.now() - wsCache.at > 30_000) {
    const p = fetch(WORLDSTATE).then((res) => {
      if (!res.ok) throw new Error(`worldState ${res.status}`);
      return res.json() as Promise<WorldState>;
    });
    p.catch(() => (wsCache = null));
    wsCache = { at: Date.now(), p };
  }
  return wsCache.p;
}

export interface Timers {
  cetusEnd: number; // end of the Cetus / Cambion bounty cycle
  baro: { from: number; to: number; relay: string } | null;
  resurgence: { to: number; frames: string[] } | null; // frame uniqueNames on offer
}

export async function getTimers(): Promise<Timers> {
  const ws = await worldState();
  const w = getDb().world;
  const cetus = ws.SyndicateMissions?.find((m) => m.Tag === "CetusSyndicate");
  const baro = ws.VoidTraders?.[0];
  const pv = ws.PrimeVaultTraders?.[0];
  return {
    cetusEnd: ms(cetus?.Expiry),
    baro: baro ? { from: ms(baro.Activation), to: ms(baro.Expiry), relay: w.regions[baro.Node]?.n ?? baro.Node } : null,
    resurgence: pv
      ? {
          to: ms(pv.Expiry),
          frames: (pv.Manifest ?? [])
            .map((m) => m.ItemType)
            .filter((t) => t.startsWith("/Lotus/StoreItems/Powersuits/"))
            .map((t) => t.replace("/Lotus/StoreItems/", "/Lotus/")),
        }
      : null,
  };
}

export async function getFissures(): Promise<Fissure[]> {
  const ws = await worldState();
  const w = getDb().world;
  const map = (m: WsMission, isStorm: boolean): Fissure => {
    const reg = w.regions[m.Node];
    const t = (isStorm ? m.ActiveMissionTier : m.Modifier) ?? "";
    return {
      id: m._id.$oid,
      node: reg?.n ?? m.Node,
      mission: (m.MissionType && w.missionType[m.MissionType]) || reg?.m || m.MissionType || "",
      enemy: reg?.f ?? "",
      tier: w.tier[t] ?? t,
      tierNum: Number(t.replace("VoidT", "")) || 0,
      expiry: Number(m.Expiry.$date.$numberLong),
      isStorm,
      isHard: !!m.Hard,
    };
  };
  return [
    ...(ws.ActiveMissions ?? []).filter((m) => m.Modifier?.startsWith("VoidT")).map((m) => map(m, false)),
    ...(ws.VoidStorms ?? []).map((m) => map(m, true)),
  ];
}

// ---------- warframe.market: all orders of an item

export type UserStatus = "ingame" | "online" | "offline";

export interface Order {
  id: string;
  type: "sell" | "buy";
  platinum: number; // price of one trade: of the whole pack when perTrade > 1
  quantity: number;
  perTrade?: number; // pieces per trade, e.g. arcanes sold in packs of 6
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
