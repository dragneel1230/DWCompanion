// Market picture for one of the player's orders: who else sells/buys the same thing (same rank and
// subtype, in game), where the player stands, what price to set, and the trade statistics.
// Data: the item's public order list (getOrders, one request per item, only on a click) and WFM's
// statistics (/v1/items/{slug}/statistics: closed trades by hour for 48 h and by day for 90 days).
// The suggestion is only filled into the price field; saving is always the player's click.
import { fetch } from "@tauri-apps/plugin-http";
import { getOrders, type Order } from "$lib/api";

export type Side = "sell" | "buy";

export interface Spec {
  type: Side;
  platinum: number; // per trade
  perTrade?: number;
  rank?: number;
  subtype?: string;
}

// One piece: packs are compared by the price of a piece.
export const unitOf = (o: { platinum: number; perTrade?: number }) => o.platinum / Math.max(1, o.perTrade ?? 1);

export interface Settings {
  step: number; // undercut / outbid by
  online: boolean; // count "online" players too, not only "in game"
  floor: number; // never suggest below this share of the 48 h median (sell), above 1/floor (buy)
}

export interface Pos {
  rivals: Order[]; // same side, same rank/subtype, not the player; best first
  rank: number; // 1 = the best price
  best: number | null; // best rival price per piece
  next: number | null; // best rival price above / below the player's
  deal: Order | null; // the other side already pays the player's price or better: trade now
  suggest: number | null; // per trade; null = keep
  why: "undercut" | "raise" | "alone" | "floor" | "keep";
}

// Orders of the same thing as `o` (rank and subtype must match where the item has them).
const same = (a: { rank?: number; subtype?: string }, b: { rank?: number; subtype?: string }) =>
  (a.rank == null || b.rank == null || a.rank === b.rank) && (a.subtype ?? "") === (b.subtype ?? "");

export function position(me: Spec, book: Order[], myName: string, set: Settings, median: number | null): Pos {
  const live = (o: Order) => o.user.status === "ingame" || (set.online && o.user.status === "online");
  const others = book.filter((o) => o.user.ingameName !== myName && live(o) && same(o, me));
  const sell = me.type === "sell";
  const dir = sell ? 1 : -1;
  const rivals = others.filter((o) => o.type === me.type).sort((a, b) => dir * (unitOf(a) - unitOf(b)));
  const mine = unitOf(me);
  const better = rivals.filter((o) => dir * (unitOf(o) - mine) < 0);
  // Same price as someone else: buyers pick either, so a step better is still worth it.
  const tied = rivals.some((o) => unitOf(o) === mine);
  const best = rivals.length ? unitOf(rivals[0]) : null;
  const next = rivals.find((o) => dir * (unitOf(o) - mine) > 0);

  // The other side already meets the price: a buyer paying at least as much, a seller asking no more.
  const counter = others.filter((o) => o.type !== me.type).sort((a, b) => dir * (unitOf(b) - unitOf(a)));
  const deal = counter.find((o) => dir * (unitOf(o) - mine) >= 0) ?? null;

  const per = Math.max(1, me.perTrade ?? 1);
  const toTrade = (u: number) => Math.max(1, Math.round(u * per));
  // Floor (sell) / ceiling (buy) from the 48 h median: don't dump an item for a fraction of its price.
  const limit = median ? (sell ? median * set.floor : median / set.floor) : null;
  const clamp = (u: number) => (limit == null ? u : sell ? Math.max(u, limit) : Math.min(u, limit));

  let suggest: number | null = null;
  let why: Pos["why"] = "keep";
  if (best == null) {
    // Nobody else: the median is a fair price.
    if (median && Math.abs(median - mine) / median > 0.15) {
      suggest = toTrade(median);
      why = "alone";
    }
  } else if (better.length || tied) {
    const target = best - dir * set.step / per;
    const u = clamp(target);
    suggest = toTrade(u);
    why = u !== target ? "floor" : "undercut";
  } else if (next) {
    // Already the best: room to raise up to one step under the next rival.
    const target = unitOf(next) - dir * set.step / per;
    if (dir * (target - mine) >= set.step / per) {
      suggest = toTrade(target);
      why = "raise";
    }
  }
  if (suggest === me.platinum) {
    suggest = null;
    why = "keep";
  }
  return { rivals, rank: better.length + 1, best, next: next ? unitOf(next) : null, deal, suggest, why };
}

// ---------- statistics

export interface StatPoint {
  t: number; // ms
  median: number;
  min: number;
  max: number;
  volume: number;
}
export interface Stats {
  hours: StatPoint[]; // 48 h
  days: StatPoint[]; // 90 days
  median48: number | null; // volume-weighted median of the last 48 h closed trades
  volume48: number;
}

interface RawStat {
  datetime: string;
  volume: number;
  min_price: number;
  max_price: number;
  median: number;
  mod_rank?: number;
  subtype?: string;
}

const STATS_TTL = 30 * 60_000;
const stats = new Map<string, { at: number; raw: { hours: RawStat[]; days: RawStat[] } }>();
const inflight = new Map<string, Promise<{ hours: RawStat[]; days: RawStat[] } | null>>();

async function rawStats(slug: string) {
  const c = stats.get(slug);
  if (c && Date.now() - c.at < STATS_TTL) return c.raw;
  let p = inflight.get(slug);
  if (!p) {
    p = (async () => {
      const res = await fetch(`https://api.warframe.market/v1/items/${slug}/statistics`, { headers: { platform: "pc", crossplay: "true" } });
      if (!res.ok) return null;
      const s = (await res.json()).payload?.statistics_closed;
      const raw = { hours: (s?.["48hours"] ?? []) as RawStat[], days: (s?.["90days"] ?? []) as RawStat[] };
      stats.set(slug, { at: Date.now(), raw });
      return raw;
    })()
      .catch(() => null)
      .finally(() => inflight.delete(slug));
    inflight.set(slug, p);
  }
  return p;
}

export const cachedStats = (slug: string, spec: { rank?: number; subtype?: string }): Stats | null => {
  const c = stats.get(slug);
  return c ? shape(c.raw, spec) : null;
};

export async function getStats(slug: string, spec: { rank?: number; subtype?: string }): Promise<Stats | null> {
  const raw = await rawStats(slug);
  return raw ? shape(raw, spec) : null;
}

function shape(raw: { hours: RawStat[]; days: RawStat[] }, spec: { rank?: number; subtype?: string }): Stats {
  const pick = (list: RawStat[]) => {
    // Mods: the rank of the order (rows for rank 0 and max); relics: the refinement.
    let rows = list;
    if (rows.some((r) => r.mod_rank != null) && spec.rank != null) rows = rows.filter((r) => r.mod_rank === spec.rank);
    if (rows.some((r) => r.subtype) && spec.subtype) rows = rows.filter((r) => r.subtype === spec.subtype);
    return rows
      .map((r) => ({ t: Date.parse(r.datetime), median: r.median, min: r.min_price, max: r.max_price, volume: r.volume }))
      .sort((a, b) => a.t - b.t);
  };
  const hours = pick(raw.hours);
  const days = pick(raw.days);
  const volume48 = hours.reduce((s, p) => s + p.volume, 0);
  // Weighted median of hourly medians.
  let median48: number | null = null;
  if (volume48) {
    const sorted = [...hours].sort((a, b) => a.median - b.median);
    let acc = 0;
    for (const p of sorted) {
      acc += p.volume;
      if (acc >= volume48 / 2) {
        median48 = p.median;
        break;
      }
    }
  }
  return { hours, days, median48, volume48 };
}

// ---------- order books of the player's items

export interface Book {
  at: number;
  list: Order[];
}
export const books = $state<Record<string, Book>>({});

export async function loadBook(slug: string, fresh = false): Promise<Book | null> {
  try {
    const list = await getOrders(slug, fresh);
    books[slug] = { at: Date.now(), list };
    return books[slug];
  } catch {
    return null;
  }
}
