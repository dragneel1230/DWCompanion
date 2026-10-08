// Yesterday's trading of every warframe.market item: relics.run's daily file (built from the market's
// own statistics: completed deals, live asks and bids). One ~4 MB download a day, not a warframe.market
// request, so whole-inventory lists can be priced without the per-item queue (see api.ts). Kept slim in
// localStorage `dwc.marketDay`, shared by the app windows.
import { fetch } from "@tauri-apps/plugin-http";
import { dataUrl } from "$lib/i18n/index.svelte";

// One rank (mods and arcanes have rank 0 and max rank rows; everything else one row).
export interface DayRow {
  deal: number | null; // median price of completed deals
  deals: number; // completed deals that day
  ask: number | null; // median of sell orders
  bid: number | null; // median of buy orders
  avg: number | null; // the market's moving average of deals (trend baseline)
}
export interface DayStat {
  r0: DayRow;
  max?: DayRow; // max rank
  maxRank?: number;
}
interface Stored {
  date: string; // the file's day, YYYY-MM-DD
  at: number;
  bySlug: Record<string, DayStat>;
}

export interface DayPrice {
  price: number; // what it sells for: the deals' median, or asks when nobody traded
  deals: number; // completed deals that day (how fast it sells)
  basis: "deals" | "asks";
  trend: number | null; // price vs the moving average: +0.15 = 15 % above
}

const KEY = "dwc.marketDay";
const URL = (d: string) => `https://relics.run/history/price_history_${d}.json`;

type RawRow = {
  order_type: "closed" | "sell" | "buy";
  mod_rank?: number;
  subtype?: string;
  volume: number;
  median: number;
  moving_avg?: number;
  item_id: string;
};

function read(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);

function slim(raw: Record<string, RawRow[]>, slugOf: Map<string, string>): Record<string, DayStat> {
  const out: Record<string, DayStat> = {};
  for (const rows of Object.values(raw)) {
    const slug = rows[0] && slugOf.get(rows[0].item_id);
    if (!slug) continue;
    // Relics come per refinement: the intact row is the one sold as "the relic".
    const plain = rows.filter((r) => !r.subtype || r.subtype === "intact");
    const ranks = [...new Set(plain.map((r) => r.mod_rank ?? 0))].sort((a, b) => a - b);
    const rowAt = (rank: number): DayRow => {
      const pick = (t: RawRow["order_type"]) => plain.find((r) => r.order_type === t && (r.mod_rank ?? 0) === rank);
      const c = pick("closed");
      const round = (v: number | undefined) => (v == null ? null : Math.round(v * 10) / 10);
      return { deal: c?.volume ? round(c.median) : null, deals: c?.volume ?? 0, ask: round(pick("sell")?.median), bid: round(pick("buy")?.median), avg: round(c?.moving_avg) };
    };
    const top = ranks.at(-1) ?? 0;
    out[slug] = top > 0 ? { r0: rowAt(0), max: rowAt(top), maxRank: top } : { r0: rowAt(0) };
  }
  return out;
}

let data: Stored | null = read();
let loading: Promise<void> | null = null;

// Today's file appears after the day ends (UTC): take yesterday's, else the day before.
export function loadMarketDay(): Promise<void> {
  if (data && data.date >= day(2) && Date.now() - data.at < 6 * 3600_000) return Promise.resolve();
  loading ??= (async () => {
    try {
      const wfm = (await (await globalThis.fetch(dataUrl("wfm.json"))).json()) as Record<string, [string]>;
      const slugOf = new Map(Object.entries(wfm).map(([id, row]) => [id, row[0]]));
      for (const d of [day(1), day(2)]) {
        if (data?.date === d) {
          data = { ...data, at: Date.now() };
          break;
        }
        const res = await fetch(URL(d));
        if (!res.ok) continue;
        data = { date: d, at: Date.now(), bySlug: slim(await res.json(), slugOf) };
        break;
      }
      if (data) localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // offline: the last day stays
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export const marketDate = () => data?.date ?? null;

// The price of one piece at a rank (mods and arcanes: max rank when owned maxed, else unranked).
export function dayPrice(slug: string | undefined, rank = 0): DayPrice | null {
  const s = slug ? data?.bySlug[slug] : undefined;
  if (!s) return null;
  const row = s.max && s.maxRank != null && rank >= s.maxRank ? s.max : s.r0;
  const price = row.deal ?? row.ask;
  if (price == null) return null;
  return {
    price,
    deals: row.deals,
    basis: row.deal != null ? "deals" : "asks",
    trend: row.deal != null && row.avg ? (row.deal - row.avg) / row.avg : null,
  };
}

// Asks and bids too (relics trade by asks; the gap shows how far apart sellers and buyers are).
export function dayRow(slug: string | undefined, rank = 0): DayRow | null {
  const s = slug ? data?.bySlug[slug] : undefined;
  if (!s) return null;
  return s.max && s.maxRank != null && rank >= s.maxRank ? s.max : s.r0;
}
