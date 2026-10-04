// Relic refinement, the chance of each reward and the relic's average value.
// Chances per reward by rarity (the wiki's "Void Relic" table, same as DE's drop tables:
// intact 25.33 / 11 / 2 % for each common / uncommon / rare reward).
import { getDb, type Rarity } from "$lib/db";
import { labels } from "$lib/i18n/index.svelte";

export type Refine = "intact" | "exceptional" | "flawless" | "radiant";

export const REFINE_RU = labels<Refine>({
  intact: "refine.intact",
  exceptional: "refine.exceptional",
  flawless: "refine.flawless",
  radiant: "refine.radiant",
});

export const CHANCE: Record<Refine, Record<Rarity, number>> = {
  intact: { COMMON: 25.33, UNCOMMON: 11, RARE: 2 },
  exceptional: { COMMON: 23.33, UNCOMMON: 13, RARE: 4 },
  flawless: { COMMON: 20, UNCOMMON: 17, RARE: 6 },
  radiant: { COMMON: 16.67, UNCOMMON: 20, RARE: 10 },
};

// Projection type suffix from EE.log: T1VoidProjectionProteaPrimeAPlatinum.
export function refineOfProjection(p: string): Refine {
  const s = p.match(/(Bronze|Silver|Gold|Platinum)$/)?.[1];
  return s === "Silver" ? "exceptional" : s === "Gold" ? "flawless" : s === "Platinum" ? "radiant" : "intact";
}

// The relic confirm dialog: "Реликвия Лит P9 [СИЯЮЩАЯ]" (ru client), "Lith P9 Relic [RADIANT]" (en).
export function parseRelicText(text: string): { key: string | null; refine: Refine } {
  const m = text.match(/^(.*?)\s*(?:\[(.+)\])?$/);
  const name = (m?.[1] ?? text).trim().toLowerCase();
  const tag = (m?.[2] ?? "").toLowerCase();
  const refine: Refine = /сияющ|radiant/.test(tag)
    ? "radiant"
    : /безупреч|flawless/.test(tag)
      ? "flawless"
      : /исключ|exceptional/.test(tag)
        ? "exceptional"
        : "intact";
  const relics = getDb().relics;
  const key = Object.keys(relics).find((k) => relics[k].ru.toLowerCase() === name || relics[k].en.toLowerCase() === name) ?? null;
  return { key, refine };
}

// Average platinum and ducats one opening gives. `sell(slug)` is the market price (undefined = not
// loaded yet); untradable rewards (Forma) count as 0 platinum.
// `squad` > 1: everyone opens the same relic at the same refinement (a "radshare") and the player takes
// the best of `squad` rewards: E[max] = Σ v·(F(v)^N − F(v⁻)^N) over rewards sorted by value.
// `by` picks what "best" means (platinum, ducats breaking ties, or the other way round).
export function relicValue(
  key: string,
  refine: Refine,
  sell: (slug: string) => number | null | undefined,
  squad = 1,
  by: "platinum" | "ducats" = "platinum",
) {
  const db = getDb();
  const r = db.relics[key];
  let loading = false;
  let rare = 0;
  const outs: { p: number; plat: number; ducats: number }[] = [];
  for (const rw of r?.rewards ?? []) {
    const it = db.items[rw.id];
    const p = CHANCE[refine][rw.rarity] / 100;
    if (rw.rarity === "RARE") rare += p;
    const s = it.slug ? sell(it.slug) : null;
    if (s === undefined) loading = true;
    outs.push({ p, plat: (s ?? 0) * rw.count, ducats: (it.ducats ?? 0) * rw.count });
  }
  const key1 = (o: (typeof outs)[number]) => (by === "ducats" ? o.ducats * 1e4 + o.plat : o.plat * 1e4 + o.ducats);
  outs.sort((x, y) => key1(x) - key1(y));
  // Chances of a refinement add up to 100 % only roughly (25.33×3 + 11×2 + 2): normalise.
  const total = outs.reduce((n, o) => n + o.p, 0) || 1;
  let plat = 0;
  let ducats = 0;
  let below = 0; // F(v⁻)
  for (const o of outs) {
    const upto = below + o.p / total;
    const w = Math.pow(upto, squad) - Math.pow(below, squad);
    plat += w * o.plat;
    ducats += w * o.ducats;
    below = upto;
  }
  return { plat, ducats, loading, rare: 1 - Math.pow(1 - rare, squad) };
}

// Void Traces to refine an intact relic.
export const TRACES: Record<Refine, number> = { intact: 0, exceptional: 25, flawless: 50, radiant: 100 };

// Extra platinum per 100 traces spent refining intact -> `to` (what a trace is worth on this relic).
export function refineGain(key: string, to: Refine, sell: (slug: string) => number | null | undefined, squad = 1): number {
  if (to === "intact") return 0;
  const gain = relicValue(key, to, sell, squad).plat - relicValue(key, "intact", sell, squad).plat;
  return (gain / TRACES[to]) * 100;
}
