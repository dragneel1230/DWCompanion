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
  platinum: number; // per trade: of the whole pack when perTrade > 1
  perTrade?: number;
  user: { status: "ingame" | "online" | "offline" };
}

// Price of one piece: packs (arcanes, some resources) are listed as "23 for 6".
const unit = (o: WfmOrder) => {
  const per = Math.max(1, o.perTrade ?? 1);
  return per > 1 ? Math.round((o.platinum / per) * 10) / 10 : o.platinum;
};

const PRICE_TTL = 5 * 60_000;
const PRICES_KEY = "dwc.prices"; // live prices shared by the app and the hub window, and across restarts
const prices = new Map<string, Price>(readStored());
const inflight = new Map<string, Promise<Price | null>>();

function readStored(): [string, Price][] {
  try {
    const all = JSON.parse(localStorage.getItem(PRICES_KEY) ?? "[]") as [string, Price][];
    return all.filter(([, p]) => Date.now() - p.at < PRICE_TTL);
  } catch {
    return [];
  }
}
let storeTimer: ReturnType<typeof setTimeout> | undefined;
function store() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => {
    try {
      localStorage.setItem(PRICES_KEY, JSON.stringify([...prices].filter(([, p]) => Date.now() - p.at < PRICE_TTL)));
    } catch {
      // storage unavailable
    }
  }, 1000);
}
window.addEventListener("storage", (e) => {
  if (e.key !== PRICES_KEY) return;
  for (const [k, p] of readStored()) if ((prices.get(k)?.at ?? 0) < p.at) prices.set(k, p);
});

// warframe.market asks clients to stay around 3 requests per second. The newest request goes first:
// what the player just opened must not wait behind a backlog of earlier pages (2026-09-30: prices came
// "later and later" once the lobby, journal and mission blocks queued dozens of items).
const MIN_GAP = 340;
const queue: (() => void)[] = [];
let pumping = false;
let lastStart = 0;
function pump() {
  const job = queue.pop();
  if (!job) {
    pumping = false;
    return;
  }
  pumping = true;
  setTimeout(() => {
    lastStart = Date.now();
    job();
    pump();
  }, Math.max(0, lastStart + MIN_GAP - Date.now()));
}
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => void fn().then(resolve, reject));
    if (!pumping) pump();
  });
}

// ---------- bulk prices of every prime part and set (one request)
// WFInfo's file (served by WFCD's api.warframestat.us): average warframe.market trade price over the
// last day, keyed by the market's English name. Lists (journal, lobby, rewards, sets) use it instead
// of one request per item; the market panel and the trade buttons still read live orders.
const BULK_URL = "https://api.warframestat.us/wfinfo/prices/";
const BULK_KEY = "dwc.bulkPrices";
const BULK_TTL = 60 * 60_000;
let bulkBySlug: Map<string, number> | null = null;
let bulkLoad: Promise<void> | null = null;

function indexBulk(byName: Record<string, number>) {
  const db = getDb();
  const m = new Map<string, number>();
  for (const x of [...Object.values(db.items), ...Object.values(db.sets)]) {
    const v = x.slug && x.mname ? byName[x.mname.toLowerCase()] : undefined;
    if (x.slug && v != null) m.set(x.slug, Math.round(v));
  }
  bulkBySlug = m;
}

export function loadBulk(): Promise<void> {
  bulkLoad ??= (async () => {
    let cached: { at: number; byName: Record<string, number> } | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(BULK_KEY) ?? "null");
    } catch {
      // storage unavailable
    }
    if (cached) indexBulk(cached.byName);
    if (cached && Date.now() - cached.at < BULK_TTL) return;
    try {
      const res = await fetch(BULK_URL);
      if (!res.ok) throw new Error(String(res.status));
      const list = (await res.json()) as { name: string; custom_avg: string }[];
      const byName: Record<string, number> = {};
      for (const x of list) {
        const v = Number(x.custom_avg);
        if (Number.isFinite(v)) byName[x.name.toLowerCase()] = v;
      }
      indexBulk(byName);
      localStorage.setItem(BULK_KEY, JSON.stringify({ at: Date.now(), byName }));
    } catch {
      // offline or down: lists fall back to live prices
    }
  })();
  return bulkLoad;
}

// The day's average price of a prime part / set, when the bulk file has it.
export const bulkSell = (slug: string): number | undefined => bulkBySlug?.get(slug);

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
    const sells = data.sell.filter(online).map(unit).sort((a, b) => a - b);
    const buys = data.buy.filter(online).map(unit).sort((a, b) => b - a);
    const price: Price = { sell: sells[0] ?? null, buy: buys[0] ?? null, sellers: sells.length, at: Date.now() };
    prices.set(slug, price);
    store();
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
  VoidTraders?: { Activation: WsDate; Expiry: WsDate; Node: string; Manifest?: { ItemType: string; PrimePrice: number; RegularPrice: number }[] }[];
  PrimeVaultTraders?: { Activation: WsDate; Expiry: WsDate; Manifest?: { ItemType: string }[] }[];
  Invasions?: WsInvasion[];
  Alerts?: WsAlert[];
  LiteSorties?: { _id: { $oid: string }; Expiry: WsDate; Boss: string }[];
  Sorties?: { _id: { $oid: string }; Expiry: WsDate }[];
  Descents?: { Expiry: WsDate; Challenges?: unknown[] }[];
  EndlessXpSchedule?: { Expiry: WsDate; CategoryChoices?: { Category: string; Choices: string[] }[] }[];
  KnownCalendarSeasons?: {
    Expiry: WsDate;
    Season: string;
    YearIteration: number;
    Version: number;
    Days: { day: number; events: { type: string; challenge?: string; reward?: string; upgrade?: string }[] }[];
  }[];
  SeasonInfo?: { ActiveChallenges?: { _id: { $oid: string }; Daily?: boolean; Expiry: WsDate; Challenge: string }[] };
}

type WsReward = { countedItems?: { ItemType: string; ItemCount: number }[]; items?: string[]; credits?: number };
interface WsInvasion {
  _id: { $oid: string };
  Node: string;
  Faction: string;
  DefenderFaction: string;
  Count: number;
  Goal: number;
  Completed: boolean;
  AttackerReward?: WsReward | unknown[];
  DefenderReward?: WsReward | unknown[];
}
interface WsAlert {
  _id: { $oid: string };
  Expiry: WsDate;
  MissionInfo?: { location?: string; missionType?: string; missionReward?: WsReward };
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
  baro: { from: number; to: number; relay: string; items?: BaroOffer[] } | null; // items: while he is here
  // Prime Resurgence: frame and weapon uniqueNames on offer, how many relics Varzia sells for Aya.
  // `frames` is the old cached shape (frames only); new data has `items`.
  resurgence: { to: number; items?: string[]; relics?: number; frames?: string[] } | null;
}

// One line of Baro's stock: store path as worldState gives it (baro.ts resolves the name).
export interface BaroOffer {
  type: string;
  ducats: number;
  credits: number;
}

export async function getTimers(): Promise<Timers> {
  const ws = await worldState();
  const w = getDb().world;
  const cetus = ws.SyndicateMissions?.find((m) => m.Tag === "CetusSyndicate");
  const baro = ws.VoidTraders?.[0];
  const pv = ws.PrimeVaultTraders?.[0];
  return {
    cetusEnd: ms(cetus?.Expiry),
    baro: baro
      ? {
          from: ms(baro.Activation),
          to: ms(baro.Expiry),
          relay: w.regions[baro.Node]?.n ?? baro.Node,
          items: baro.Manifest?.map((m) => ({ type: m.ItemType, ducats: m.PrimePrice, credits: m.RegularPrice })),
        }
      : null,
    resurgence: pv
      ? {
          to: ms(pv.Expiry),
          items: (pv.Manifest ?? [])
            .map((m) => m.ItemType)
            .filter((t) => t.startsWith("/Lotus/StoreItems/Powersuits/") || t.startsWith("/Lotus/StoreItems/Weapons/"))
            .map((t) => t.replace("/Lotus/StoreItems/", "/Lotus/")),
          relics: (pv.Manifest ?? []).filter((m) => m.ItemType.includes("/Projections/")).length,
        }
      : null,
  };
}

// This week's activities (the «Сейчас» weekly panel; the player's progress is in the inventory, InvWeek).
export interface Week {
  archon: { id: string; boss: string; until: number } | null;
  descent: { floors: number; until: number } | null;
  circuit: { normal: string[]; hard: string[]; until: number } | null;
  calendar: { season: string; it: number; ver: number; until: number; days: { type: string; ids: string[] }[] } | null;
  nightwave: { id: string; key: string; daily: boolean; until: number }[];
}

export async function getWeek(): Promise<Week> {
  const ws = await worldState();
  const lite = ws.LiteSorties?.[0];
  const d = ws.Descents?.[0];
  const ex = ws.EndlessXpSchedule?.[0];
  const cal = ws.KnownCalendarSeasons?.[0];
  const choices = (cat: string) => ex?.CategoryChoices?.find((c) => c.Category === cat)?.Choices ?? [];
  return {
    archon: lite ? { id: lite._id.$oid, boss: lite.Boss, until: ms(lite.Expiry) } : null,
    descent: d ? { floors: d.Challenges?.length ?? 0, until: ms(d.Expiry) } : null,
    circuit: ex ? { normal: choices("EXC_NORMAL"), hard: choices("EXC_HARD"), until: ms(ex.Expiry) } : null,
    calendar: cal
      ? {
          season: cal.Season,
          it: cal.YearIteration,
          ver: cal.Version,
          until: ms(cal.Expiry),
          days: cal.Days.map((x) => ({
            type: x.events[0]?.type ?? "",
            ids: x.events.map((e) => e.challenge ?? e.reward ?? e.upgrade ?? "").filter(Boolean),
          })),
        }
      : null,
    nightwave: (ws.SeasonInfo?.ActiveChallenges ?? [])
      .filter((c) => ms(c.Expiry) > Date.now())
      .map((c) => ({ id: c._id.$oid, key: c.Challenge.split("/").pop() ?? c.Challenge, daily: !!c.Daily, until: ms(c.Expiry) })),
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

// Invasions and alerts (notification filters). Rewards keep their game paths; store paths
// ("/Lotus/StoreItems/...") are turned into item paths. Names are resolved by whoever shows them.
export interface Reward {
  id: string;
  n: number;
}
export interface Invasion {
  id: string;
  node: string;
  rewards: Reward[]; // both sides
  pct: number; // 0..1 progress to either side's win
}
export interface Alert {
  id: string;
  node: string;
  mission: string;
  expiry: number;
  rewards: Reward[];
}

const itemPath = (p: string) => p.replace("/StoreItems/", "/");
function rewardsOf(r: WsReward | unknown[] | undefined): Reward[] {
  if (!r || Array.isArray(r)) return [];
  return [
    ...(r.countedItems ?? []).map((x) => ({ id: itemPath(x.ItemType), n: x.ItemCount ?? 1 })),
    ...(r.items ?? []).map((x) => ({ id: itemPath(x), n: 1 })),
  ];
}

export async function getInvasions(): Promise<Invasion[]> {
  const ws = await worldState();
  const w = getDb().world;
  return (ws.Invasions ?? [])
    .filter((v) => !v.Completed)
    .map((v) => ({
      id: v._id.$oid,
      node: w.regions[v.Node]?.n ?? v.Node,
      rewards: [...rewardsOf(v.AttackerReward), ...rewardsOf(v.DefenderReward)],
      pct: v.Goal ? Math.min(1, Math.abs(v.Count) / v.Goal) : 0,
    }));
}

export async function getAlerts(): Promise<Alert[]> {
  const ws = await worldState();
  const w = getDb().world;
  return (ws.Alerts ?? [])
    .filter((a) => ms(a.Expiry) > Date.now())
    .map((a) => {
      const node = a.MissionInfo?.location ?? "";
      const mt = a.MissionInfo?.missionType ?? "";
      return { id: a._id.$oid, node: w.regions[node]?.n ?? node, mission: w.missionType[mt] ?? mt, expiry: ms(a.Expiry), rewards: rewardsOf(a.MissionInfo?.missionReward) };
    });
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
