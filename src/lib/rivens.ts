// Rivens: stats from the inventory fingerprint. Base values, texts, name syllables, dispositions: DE's export
// (static/data/<lang>/rivens.json, scripts/build-rivens.mjs). The roll math is calamity-inc's RivenParser
// (github.com/calamity-inc/warframe-riven-info, the browse.wf riven tool): value = base × 1.5 × disposition × 10 ×
// lerp(0.9, 1.1, roll) × by-count factor × (rank + 1); a curse raises the buffs ×1.25 each. It matches the wiki's
// base values ("Riven Mods": Puncture on rifles 119.997 % = 0.01333 × 90). Cycle costs and dissolve Endo: wiki.
import { dataUrl, num } from "$lib/i18n/index.svelte";
import type { InvRiven } from "$lib/inventory.svelte";

export interface RivenStatDef {
  v: number; // base value per rank (DE)
  l: string; // "|val|% Critical Chance"
  pre: string;
  suf: string;
  rev?: 1; // DE shows the sign reversed
}
export interface RivensDb {
  types: Record<string, { name: string; icon: string | null; stats: Record<string, RivenStatDef> }>;
  raw: Record<string, { name: string; icon: string | null }>;
  weapons: Record<string, { name: string; icon: string | null; d: number; slug?: string }>;
  challenges: Record<string, string>;
  complications: Record<string, string>;
}

let cache: Promise<RivensDb> | null = null;
export function loadRivens(): Promise<RivensDb> {
  cache ??= fetch(dataUrl("rivens.json")).then((r) => r.json() as Promise<RivensDb>);
  cache.catch(() => (cache = null));
  return cache;
}

export const MAX_RANK = 8;
const BY_COUNT = [0, 1, 0.66000003, 0.5, 0.40000001, 0.34999999];
const CURSE_BY_BUFFS = [0, 1, 0.33000001, 0.5, 1.25, 1.5];
const roll = (i: number) => {
  const f = i / 0x3fffffff;
  return f >= 0 && f <= 1 ? f : 0;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const at = <T>(xs: T[], n: number) => xs[Math.min(n, xs.length - 1)];

export interface RivenStat {
  tag: string;
  text: string; // with the number in
  value: number;
  roll: number; // 0..1 inside the 90–110 % range
  curse: boolean;
  max: string; // the value at rank 8
}
export interface Riven {
  r: InvRiven;
  weapon: string;
  icon: string | null;
  slug?: string;
  disposition: number;
  name: string; // "Boltor Crita-visiata"
  stats: RivenStat[];
  endo: number; // when dissolved (wiki)
  nextCycle: number; // Kuva for the next cycle (wiki)
}

// Faction damage reads as a multiplier on the card; seconds, meters and counts are plain numbers.
const FACTION = /FactionDamage/;
// The number alone ("+21,7 %", "×1,06", "+2,7"); `shown` puts it into DE's stat text.
function valueText(def: RivenStatDef, tag: string, value: number): string {
  const v = def.rev ? -value : value;
  if (FACTION.test(tag)) return `×${num(Math.round((1 + v) * 100) / 100, 2)}`;
  const pct = def.l.includes("|val|%");
  const n = pct ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
  return `${n > 0 ? "+" : ""}${num(n)}${pct ? "%" : ""}`;
}
const shown = (def: RivenStatDef, tag: string, value: number) => def.l.replace(/\|val\|%?/, valueText(def, tag, value));

// Wiki "Riven Mods", Cycling: 900, 1000, 1200 … 3500 Kuva from the 10th cycle on.
const CYCLE = [900, 1000, 1200, 1400, 1700, 2000, 2350, 2750, 3150, 3500];
// Wiki "Riven Mods", Dissolution: 100 × (MR − 8) + ⌊22.5 × 2^rank⌋ + 200 × cycles − 7.
export const dissolveEndo = (mr: number, rank: number, rerolls: number) => 100 * (mr - 8) + Math.floor(22.5 * 2 ** rank) + 200 * rerolls - 7;

export function parseRiven(db: RivensDb, r: InvRiven): Riven | null {
  const type = db.types[r.type];
  const w = r.compat ? db.weapons[r.compat] : undefined;
  if (!type || !r.compat || !r.buffs.length) return null;
  const d = w?.d ?? 1;
  const base = 1.5 * d * 10 * (r.lvl + 1);
  const curseUp = 1.25 ** r.curses.length;
  const stats: RivenStat[] = [];
  for (const [tag, v] of r.buffs) {
    const def = type.stats[tag];
    if (!def) continue;
    const value = def.v * base * curseUp * lerp(0.9, 1.1, roll(v)) * at(BY_COUNT, r.buffs.length);
    stats.push({ tag, text: shown(def, tag, value), value, roll: roll(v), curse: false, max: valueText(def, tag, (value / (r.lvl + 1)) * (MAX_RANK + 1)) });
  }
  for (const [tag, v] of r.curses) {
    const def = type.stats[tag];
    if (!def) continue;
    const value = -def.v * base * lerp(0.9, 1.1, roll(v)) * at(CURSE_BY_BUFFS, r.buffs.length) * at(BY_COUNT, r.curses.length);
    stats.push({ tag, text: shown(def, tag, value), value, roll: roll(v), curse: true, max: valueText(def, tag, (value / (r.lvl + 1)) * (MAX_RANK + 1)) });
  }
  return {
    r,
    weapon: w?.name ?? r.compat.split("/").pop()!,
    icon: w?.icon ?? null,
    slug: w?.slug,
    disposition: d,
    name: `${w?.name ?? ""} ${rivenName(type.stats, r.buffs)}`.trim(),
    stats,
    endo: dissolveEndo(r.mr ?? 8, r.lvl, r.rr),
    nextCycle: at(CYCLE, r.rr),
  };
}

// The name the game gives: buffs by roll, highest first (ties: smaller base value first); the first gives a
// prefix, the middle ones "-prefix", the last its suffix (RivenParser).
function rivenName(defs: Record<string, RivenStatDef>, buffs: [string, number][]): string {
  const best: Record<string, number> = {};
  for (const [tag, v] of buffs) best[tag] = Math.max(best[tag] ?? 0, v);
  const sorted = [...buffs].sort((a, b) => (best[a[0]] === best[b[0]] ? (defs[a[0]]?.v ?? 0) - (defs[b[0]]?.v ?? 0) : best[b[0]] - best[a[0]]));
  let name = "";
  for (const [tag] of sorted) {
    const d = defs[tag];
    if (!d) continue;
    if (tag === sorted[sorted.length - 1][0]) name += d.suf;
    else if (tag === sorted[0][0]) name += d.pre.charAt(0).toUpperCase() + d.pre.slice(1);
    else name += `-${d.pre}`;
  }
  return name;
}

// Veiled riven challenge: "Убейте несколько (50) врагов, будучи незамеченными".
export function challengeText(db: RivensDb, ch: NonNullable<InvRiven["ch"]>): string {
  const main = (db.challenges[ch.type] ?? ch.type.split("/").pop()!).replace("|COUNT|", String(ch.need));
  const comp = ch.comp ? db.complications[ch.comp] : "";
  return comp ? `${main.replace(/[\s.,]+$/, "")}, ${comp.replace(/^[\s,]+/, "")}` : main;
}

// warframe.market riven auctions for the weapon (an outside link, no request from the app).
export const auctionsUrl = (slug: string) => `https://warframe.market/auctions/search?type=riven&weapon_url_name=${slug}&sort_by=price_asc`;
