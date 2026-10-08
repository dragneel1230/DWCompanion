// What the inventory is worth and what to do with it: spare things to sell, prime sets to complete or sell
// whole, relics to open or sell, relics worth farming. Pure: inventory snapshot + database + yesterday's
// market (marketDay.ts). Prices are the median of yesterday's completed warframe.market deals (asks when
// nobody traded): every number on the page says which.
import { getDb, itemName, setParts, type PrimeSet, type Relic } from "$lib/db";
import type { FramesDb, Mod, Arcane } from "$lib/frames";
import type { InvData } from "$lib/inventory.svelte";
import { dayPrice, dayRow, type DayPrice } from "$lib/marketDay";
import { relicValue, type Refine } from "$lib/relicValue";

export type TradeKind = "part" | "mod" | "arcane" | "misc";

export interface Prefs {
  keepCopies: number; // mods and arcanes: copies to keep for yourself
  keepGoals: boolean; // prime parts a goal needs aren't spare
  keepUnbuilt: boolean; // prime parts of every set you haven't built aren't spare
}
export const DEFAULT_PREFS: Prefs = { keepCopies: 1, keepGoals: true, keepUnbuilt: false };

export interface TradeRow {
  id: string;
  kind: TradeKind;
  name: string;
  icon: string | null;
  slug: string;
  count: number;
  rank: number; // best owned rank (mods, arcanes)
  keep: number;
  spare: number;
  price: DayPrice | null; // of one spare piece
  ducats: number; // of one piece (prime parts)
  kept?: "goal" | "set" | "copies";
  setId?: string;
  mod?: Mod; // drawn as the game's card, not the bare art
  arcane?: Arcane;
}

export interface SetPart {
  id: string;
  name: string;
  icon: string | null;
  slug?: string;
  need: number;
  have: number; // tradeable pieces (blueprints / parts, not built components)
  price: DayPrice | null;
  relics: { key: string; s: string; era: string; vaulted: boolean }[];
}
export interface SetRow {
  id: string;
  set: PrimeSet;
  parts: SetPart[];
  full: number; // whole sets you can trade now
  missing: SetPart[]; // for the next set
  have: number; // parts toward the next set
  total: number; // parts in a set
  price: DayPrice | null; // the set
  partsSum: number | null; // all parts sold one by one
  missingCost: number | null; // buying what's missing
  built: boolean; // the item is in your arsenal or ranked
  goal: boolean;
}

export interface RelicStack {
  key: string;
  relic: Relic;
  counts: Partial<Record<Refine, number>>;
  total: number;
  ev: Record<Refine, number>; // average platinum of one opening, solo
  squad: number; // radiant, 4 players open the same (radshare)
  ask: number | null;
  bid: number | null;
  goal: boolean; // drops a part a goal needs
}

const REFINES: Refine[] = ["intact", "exceptional", "flawless", "radiant"];
const REFINE_OF: Record<string, Refine> = { Bronze: "intact", Silver: "exceptional", Gold: "flawless", Platinum: "radiant" };

// Market price of one piece for relic averages (null: no data = 0, as untradable Forma).
const sell = (slug: string) => dayPrice(slug)?.price ?? null;

// A part counts as owned as its blueprint / part (tradeable) — built components are not.
const tradeable = (inv: InvData, id: string) => inv.items[id] ?? 0;

// Sets the player still wants: goals, or (pref) every set not built yet.
function wanted(inv: InvData, goalIds: Set<string>, p: Prefs) {
  const out = new Map<string, "goal" | "set">();
  const db = getDb();
  for (const [id] of Object.entries(db.sets)) {
    const built = inv.arsenal.includes(id) || inv.xp[id] != null;
    if (built) continue;
    if (p.keepGoals && goalIds.has(id)) out.set(id, "goal");
    else if (p.keepUnbuilt) out.set(id, "set");
  }
  return out;
}

export function tradeRows(inv: InvData, frames: FramesDb, other: Record<string, Mod>, goalIds: Set<string>, p: Prefs): TradeRow[] {
  const db = getDb();
  const rows: TradeRow[] = [];
  const want = wanted(inv, goalIds, p);
  // Pieces kept for sets: per part id.
  const keepFor = new Map<string, { n: number; why: "goal" | "set"; set: string }>();
  for (const [sid, why] of want) {
    for (const { id, count } of setParts(db.sets[sid])) {
      const k = keepFor.get(id);
      keepFor.set(id, { n: (k?.n ?? 0) + count, why: k?.why === "goal" ? "goal" : why, set: sid });
    }
  }

  for (const [id, count] of Object.entries(inv.items)) {
    const it = db.items[id];
    if (!it?.slug || count <= 0) continue;
    const k = keepFor.get(id);
    const keep = Math.min(count, k?.n ?? 0);
    rows.push({
      id,
      kind: it.set ? "part" : "misc",
      name: itemName(it),
      icon: it.icon,
      slug: it.slug,
      count,
      rank: 0,
      keep,
      spare: count - keep,
      price: dayPrice(it.slug),
      ducats: it.ducats ?? 0,
      kept: keep ? k!.why : undefined,
      setId: it.set,
    });
  }

  for (const [id, [count, rank]] of Object.entries(inv.mods)) {
    const arcane = frames.arcanes[id];
    const mod = arcane ? undefined : (frames.mods[id] ?? other[id]);
    const m = mod ?? arcane;
    if (!m?.slug) continue;
    const kind: TradeKind = arcane ? "arcane" : "mod";
    const keep = Math.min(count, p.keepCopies);
    const spare = count - keep;
    // Spare copies are the unranked ones; a lone copy sells at its rank.
    rows.push({
      id,
      kind,
      name: m.name,
      icon: m.icon,
      slug: m.slug,
      count,
      rank,
      keep,
      spare,
      price: dayPrice(m.slug, count === 1 ? rank : 0),
      ducats: 0,
      kept: keep ? "copies" : undefined,
      mod,
      arcane,
    });
  }
  return rows;
}

export function setRows(inv: InvData, goalIds: Set<string>): SetRow[] {
  const db = getDb();
  const out: SetRow[] = [];
  for (const [id, set] of Object.entries(db.sets)) {
    const list = setParts(set);
    if (!list.some((x) => tradeable(inv, x.id))) continue;
    const parts: SetPart[] = list.map(({ id: pid, count }) => {
      const it = db.items[pid];
      return {
        id: pid,
        name: it ? itemName(it) : pid,
        icon: it?.icon ?? null,
        slug: it?.slug,
        need: count,
        have: tradeable(inv, pid),
        price: dayPrice(it?.slug),
        relics: (it?.relics ?? [])
          .map((r) => ({ key: r.relic, s: db.relics[r.relic]?.s ?? r.relic, era: db.relics[r.relic]?.era ?? "", vaulted: db.relics[r.relic]?.vaulted ?? true }))
          .sort((a, b) => +a.vaulted - +b.vaulted),
      };
    });
    const full = Math.min(...parts.map((x) => Math.floor(x.have / x.need)));
    const left = (x: SetPart) => x.have - full * x.need;
    const missing = parts.filter((x) => left(x) < x.need).map((x) => ({ ...x, need: x.need - Math.max(0, left(x)) }));
    const total = parts.reduce((n, x) => n + x.need, 0);
    const sum = (xs: SetPart[]) => (xs.every((x) => x.price) ? xs.reduce((n, x) => n + x.price!.price * x.need, 0) : null);
    out.push({
      id,
      set,
      parts,
      full,
      missing,
      have: total - missing.reduce((n, x) => n + x.need, 0),
      total,
      price: dayPrice(set.slug),
      partsSum: sum(parts),
      missingCost: missing.length ? sum(missing) : 0,
      built: inv.arsenal.includes(id) || inv.xp[id] != null,
      goal: goalIds.has(id),
    });
  }
  return out;
}

// Parts the goals still need: relics that drop them are marked.
function goalParts(inv: InvData, goalIds: Set<string>): Set<string> {
  const db = getDb();
  const out = new Set<string>();
  for (const gid of goalIds) {
    const set = db.sets[gid];
    if (!set) continue;
    for (const { id, count } of setParts(set)) if (tradeable(inv, id) < count) out.add(id);
  }
  return out;
}

export function relicStacks(inv: InvData, goalIds: Set<string>): RelicStack[] {
  const db = getDb();
  const need = goalParts(inv, goalIds);
  const by = new Map<string, RelicStack>();
  for (const [id, n] of Object.entries(inv.items)) {
    if (!id.includes("/Projections/") || n <= 0) continue;
    const m = id.split("/").pop()!.match(/^(.*?)(Bronze|Silver|Gold|Platinum)$/);
    const key = m && db.projections[m[1]];
    if (!key || !db.relics[key]) continue;
    const r = db.relics[key];
    let s = by.get(key);
    if (!s) {
      const row = dayRow(r.slug);
      const ev = Object.fromEntries(REFINES.map((f) => [f, relicValue(key, f, sell).plat])) as Record<Refine, number>;
      s = {
        key,
        relic: r,
        counts: {},
        total: 0,
        ev,
        squad: relicValue(key, "radiant", sell, 4).plat,
        ask: row?.ask ?? null,
        bid: row?.bid ?? null,
        goal: r.rewards.some((x) => need.has(x.id)),
      };
      by.set(key, s);
    }
    const f = REFINE_OF[m![2]];
    s.counts[f] = (s.counts[f] ?? 0) + n;
    s.total += n;
  }
  return [...by.values()];
}

// Relics that drop now, by average platinum of an opening.
export interface FarmRelic {
  key: string;
  relic: Relic;
  ev: number; // intact, solo
  radiant: number; // radiant, solo
  squad: number; // radiant ×4
  have: number;
  goal: boolean;
}
export function farmRelics(inv: InvData | null, goalIds: Set<string>): FarmRelic[] {
  const db = getDb();
  const need = inv ? goalParts(inv, goalIds) : new Set<string>();
  const have = new Map<string, number>();
  if (inv)
    for (const s of relicStacks(inv, new Set())) have.set(s.key, s.total);
  return Object.entries(db.relics)
    .filter(([, r]) => !r.vaulted && r.era !== "Requiem")
    .map(([key, relic]) => ({
      key,
      relic,
      ev: relicValue(key, "intact", sell).plat,
      radiant: relicValue(key, "radiant", sell).plat,
      squad: relicValue(key, "radiant", sell, 4).plat,
      have: have.get(key) ?? 0,
      goal: relic.rewards.some((x) => need.has(x.id)),
    }));
}

// Plain "ducats or platinum" rule of thumb: a part worth ≥ 10 ducats per platinum goes to Baro.
export const DUCATS_PER_PLAT = 10;
export const forDucats = (r: TradeRow) => r.ducats > 0 && r.price != null && r.ducats / Math.max(1, r.price.price) >= DUCATS_PER_PLAT;

// What n pieces realistically bring: the whole market completed `deals` a day yesterday, so more than a
// week of that won't sell; nobody trading (asks only) brings nothing for sure.
export const WEEK = 7;
export const sellable = (r: TradeRow, n: number) => (r.price?.basis === "deals" ? Math.min(n, Math.ceil(r.price.deals * WEEK)) : 0);
export const realValue = (r: TradeRow, n: number) => (r.price ? r.price.price * sellable(r, n) : 0);

// How fast it sells, by completed deals a day: shown as words and dots, the number in the tooltip.
export type Speed = "fast" | "ok" | "slow" | "rare";
export const speedOf = (deals: number): Speed => (deals >= 20 ? "fast" : deals >= 5 ? "ok" : deals >= 1 ? "slow" : "rare");
