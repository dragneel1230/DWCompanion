// Gear besides warframes that takes mods: weapons, companions and their weapons, archwings, arch-guns,
// arch-melee, necramechs (static/data/<lang>/gear.json, scripts/build-gear.mjs). Their mods are in mods.json
// (frames.ts loadOtherMods), arcanes in frames.json. Builds: configs from the game (inventory) and the
// user's own (gearBuilds.svelte.ts). Stats: DE's base numbers with the mods' unconditional effects.
import { dataUrl } from "$lib/i18n/index.svelte";
import { inventory } from "$lib/inventory.svelte";
import { rankOf as xpRank } from "$lib/mastery";
import { loadFrames, loadOtherMods, modCost, type Arcane, type Mod, type Polarity } from "$lib/frames";
import { t } from "$lib/i18n/index.svelte";

export type GearKind = "primary" | "secondary" | "melee" | "companion" | "cweapon" | "archwing" | "archgun" | "archmelee" | "mech";
export const GEAR_KINDS: GearKind[] = ["primary", "secondary", "melee", "companion", "cweapon", "archwing", "archgun", "archmelee", "mech"];
export const isWeapon = (k: GearKind) => !["companion", "archwing", "mech"].includes(k);
// Companions, archwings and necramechs level like warframes (XP curve, rank 30 = 60 capacity with a reactor).
const powersuit = (k: GearKind) => !isWeapon(k);

export interface WeaponBase {
  dmg: number[]; // per damage type, DE's order (DMG_TYPES)
  cc: number; // crit chance, 0.25 = 25%
  cm: number; // crit multiplier
  sc: number; // status chance per pellet
  fr: number; // fire rate / attack speed
  ms: number; // multishot
  mag?: number;
  rel?: number; // reload, s
  trig?: string;
  range?: number; // melee, m
}

export interface Gear {
  name: string;
  ru: string;
  en: string;
  icon: string | null;
  mr?: number;
  pols: Polarity[];
  kind: GearKind;
  type?: string; // primary: Rifle / Shotgun / Sniper / Launcher / Bow; companion: Sentinels / KubrowPets / MoaPets
  prime?: boolean;
  maxRank: number;
  slots: number;
  exilus?: boolean;
  stance?: boolean;
  arcane?: boolean;
  exPol?: Polarity;
  stPol?: Polarity;
  classes: string[];
  tags?: string[];
  w?: WeaponBase;
  d?: { health: number; shield: number; armor: number; energy: number }; // max rank
}

export interface GearCtx {
  items: Record<string, Gear>;
  mods: Record<string, Mod>;
  arcanes: Record<string, Arcane>;
}

let cache: Promise<GearCtx> | null = null;
export function loadGear(): Promise<GearCtx> {
  cache ??= Promise.all([
    fetch(dataUrl("gear.json")).then((r) => r.json() as Promise<{ items: Record<string, Gear> }>),
    loadOtherMods(),
    loadFrames(),
  ]).then(([g, mods, f]) => ({ items: g.items, mods, arcanes: f.arcanes }));
  cache.catch(() => (cache = null));
  return cache;
}

export type GearSlot = "stance" | "exilus" | number;

export interface GearPols {
  slots: (Polarity | null)[];
  exilus: Polarity | null;
  stance: Polarity | null;
}

export interface GearBuild {
  item: string;
  title: string;
  author: string;
  note?: string;
  source?: "game";
  slots: (string | null)[];
  exilus: string | null;
  stance: string | null;
  arcanes: string[];
  pols?: GearPols;
  ranks?: { slots: (number | null)[]; exilus: number | null; stance: number | null }; // missing = max rank
  rank?: number;
  catalyst?: boolean; // Orokin Catalyst / Reactor
}

export function emptyGearBuild(id: string, g: Gear): GearBuild {
  return {
    item: id,
    title: "",
    author: "",
    slots: Array(g.slots).fill(null),
    exilus: null,
    stance: null,
    arcanes: [],
    pols: innateGearPols(g),
    ranks: { slots: Array(g.slots).fill(null), exilus: null, stance: null },
    rank: powersuit(g.kind) || g.maxRank <= 30 ? 30 : g.maxRank,
    catalyst: true,
  };
}

export function innateGearPols(g: Gear): GearPols {
  return { slots: Array.from({ length: g.slots }, (_, i) => g.pols[i] ?? null), exilus: g.exPol ?? null, stance: g.stPol ?? null };
}

// ---------- Which mods fit

// A mod fits when its DE class is one of the gear's classes, and (for tagged mods: stances, companion families,
// projectile / beam weapons) the gear carries one of its tags.
export function fits(mod: Mod, g: Gear): boolean {
  if (!mod.compat || !g.classes.includes(mod.compat)) return false;
  return !mod.tags?.length || mod.tags.some((x) => g.tags?.includes(x));
}

// Same-named variants (Conclave, old versions): the tradable one with more ranks.
const better = (a: Mod, b: Mod) => (!!a.slug !== !!b.slug ? !!a.slug : a.max > b.max);

export function modsForGear(ctx: GearCtx, g: Gear, slot: GearSlot): [string, Mod][] {
  const best = new Map<string, [string, Mod]>();
  for (const [id, m] of Object.entries(ctx.mods)) {
    if (!fits(m, g)) continue;
    if (slot === "stance" ? !m.stance : m.stance) continue;
    if (slot === "exilus" && !m.exilus) continue;
    const prev = best.get(m.en);
    if (!prev || better(m, prev[1])) best.set(m.en, [id, m]);
  }
  return [...best.values()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

export function arcanesForGear(ctx: GearCtx, g: Gear): [string, Arcane][] {
  if (!g.arcane) return [];
  return Object.entries(ctx.arcanes)
    .filter(([, a]) => a.use === g.kind && (!a.only || a.only === g.type))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

// ---------- Equipped mods, capacity, forma

export interface Equipped {
  id: string;
  mod: Mod;
  rank: number;
  pol: Polarity | null;
  slot: GearSlot;
}

export function gearEquipped(ctx: GearCtx, b: GearBuild): Equipped[] {
  const out: Equipped[] = [];
  const add = (id: string | null, pol: Polarity | null | undefined, r: number | null | undefined, slot: GearSlot) => {
    const mod = id ? ctx.mods[id] : undefined;
    if (id && mod) out.push({ id, mod, rank: Math.min(r ?? mod.max, mod.max), pol: pol ?? null, slot });
  };
  b.slots.forEach((m, i) => add(m, b.pols?.slots[i], b.ranks?.slots[i], i));
  add(b.exilus, b.pols?.exilus, b.ranks?.exilus, "exilus");
  add(b.stance, b.pols?.stance, b.ranks?.stance, "stance");
  return out;
}

// Like the arsenal's counter: rank (doubled by a catalyst / reactor) + stance bonus, minus drains.
export function gearCapacity(ctx: GearCtx, g: Gear, b: GearBuild) {
  let total = (b.rank ?? 30) * (b.catalyst === false ? 1 : 2);
  let used = 0;
  for (const e of gearEquipped(ctx, b)) {
    const c = modCost(e.mod, e.pol, e.rank);
    if (e.mod.stance) total -= c;
    else used += c;
  }
  return { used, total };
}

// Forma: slot polarities not covered by the innate set (the game lets innate ones move freely), a changed
// stance polarity, an exilus polarity other than the innate one.
export function gearForma(g: Gear, pols: GearPols | undefined) {
  const p = pols ?? innateGearPols(g);
  const pool = [...g.pols];
  const slots = p.slots.map((pol) => {
    if (!pol) return false;
    const i = pool.indexOf(pol);
    if (i < 0) return true;
    pool.splice(i, 1);
    return false;
  });
  const exilus = !!p.exilus && p.exilus !== g.exPol;
  const stance = !!p.stance && p.stance !== g.stPol;
  return { count: slots.filter(Boolean).length + (exilus ? 1 : 0) + (stance ? 1 : 0), slots, exilus, stance };
}

// ---------- Stats

export const DMG_TYPES = [
  "impact", "puncture", "slash", "heat", "cold", "electricity", "toxin", "blast", "radiation", "gas", "magnetic", "viral", "corrosive", "void", "tau",
] as const;
// Two base elements -> the combined one (DE's indexes): heat 3, cold 4, electricity 5, toxin 6.
const COMBINE: Record<string, number> = { "3,4": 7, "3,5": 8, "3,6": 9, "4,5": 10, "4,6": 11, "5,6": 12 };
const combo = (a: number, b: number) => COMBINE[[a, b].sort((x, y) => x - y).join(",")];

function modSums(ctx: GearCtx, g: Gear, b: GearBuild) {
  const sum: Record<string, number> = {};
  const order: number[] = []; // elements in slot order
  for (const e of gearEquipped(ctx, b)) {
    const fx = e.mod.fx ?? {};
    for (const [k, arr] of Object.entries(fx)) {
      const v = arr?.[e.rank] ?? 0;
      if (!v || k === "frb") continue;
      if (k === "fr" && g.type === "Bow" && fx.frb) {
        sum.fr = (sum.fr ?? 0) + (fx.frb[e.rank] ?? 0);
        continue;
      }
      if (/^e\d+$/.test(k) && !order.includes(Number(k.slice(1)))) order.push(Number(k.slice(1)));
      sum[k] = (sum[k] ?? 0) + v;
    }
  }
  return { sum, order };
}

export interface WeaponStats {
  dmg: number[]; // per type after mods
  total: number;
  cc: number;
  cm: number;
  sc: number;
  fr: number;
  ms: number;
  mag?: number;
  rel?: number;
  range?: number;
  avg: number; // one pellet with crits averaged
  burst: number; // per second while firing
  sustained: number; // with reloads
}

// Damage: base × (1 + Damage mods); physical mods scale only their own type; an elemental mod adds its % of the
// modded base total. Elements combine in slot order, the weapon's innate ones last (or into the same one).
export function weaponStats(ctx: GearCtx, g: Gear, b: GearBuild): WeaponStats | null {
  const w = g.w;
  if (!w) return null;
  const { sum, order } = modSums(ctx, g, b);
  const pct = (k: string) => (sum[k] ?? 0) / 100;
  const dm = 1 + pct("dmg");
  const base = [...w.dmg, ...Array(Math.max(0, 15 - w.dmg.length)).fill(0)];
  const total0 = base.reduce((a, x) => a + x, 0);
  const out = Array(15).fill(0) as number[];
  for (let i = 0; i < 3; i++) out[i] = base[i] * dm * (1 + pct(`e${i}`));
  for (let i = 13; i < 15; i++) out[i] = base[i] * dm;

  const entries: { idx: number; parts: number[]; v: number }[] = [];
  const place = (i: number, v: number) => {
    if (!v) return;
    const same = entries.find((x) => x.idx === i || x.parts.includes(i));
    if (same) return void (same.v += v);
    if (i >= 3 && i <= 6) {
      const lone = entries.find((x) => x.idx >= 3 && x.idx <= 6 && !x.parts.length);
      if (lone) {
        lone.parts = [lone.idx, i];
        lone.idx = combo(lone.idx, i);
        lone.v += v;
        return;
      }
    }
    entries.push({ idx: i, parts: [], v });
  };
  for (const i of order) if (i >= 3) place(i, pct(`e${i}`) * total0 * dm);
  for (let i = 3; i <= 6; i++) place(i, base[i] * dm);
  for (let i = 7; i <= 12; i++) place(i, base[i] * dm);
  for (const e of entries) out[e.idx] += e.v;

  const total = out.reduce((a, x) => a + x, 0);
  const cc = w.cc * (1 + pct("cc"));
  const cm = w.cm * (1 + pct("cd"));
  const sc = w.sc * (1 + pct("sc"));
  const fr = w.fr * (1 + pct("fr"));
  const ms = w.ms * (1 + pct("ms"));
  const mag = w.mag ? Math.max(1, Math.round(w.mag * (1 + pct("mag")))) : undefined;
  const rel = w.rel ? w.rel / (1 + pct("rel")) : undefined;
  const avg = total * (1 + cc * (cm - 1));
  const burst = avg * ms * fr;
  const sustained = mag && rel ? (avg * ms * mag) / (mag / fr + rel) : burst;
  return { dmg: out, total, cc, cm, sc, fr, ms, mag, rel, range: w.range ? w.range + (sum.range ?? 0) : undefined, avg, burst, sustained };
}

// Companions, archwings, necramechs: max-rank numbers with the mods' percent.
export function suitStats(ctx: GearCtx, g: Gear, b: GearBuild) {
  if (!g.d) return null;
  const { sum } = modSums(ctx, g, b);
  const pct = (k: string) => 1 + (sum[k] ?? 0) / 100;
  return {
    health: g.d.health * pct("hp") + (sum.hpFlat ?? 0),
    shield: g.d.shield * pct("sh") + (sum.shFlat ?? 0),
    armor: g.d.armor * pct("arm"),
    energy: g.d.energy * pct("en"),
    str: 100 + (sum.str ?? 0),
    dur: 100 + (sum.dur ?? 0),
    rng: 100 + (sum.rng ?? 0),
    eff: 100 + (sum.eff ?? 0),
  };
}

// ---------- Configs from the game (inventory snapshot)

const AP: Record<string, Polarity> = {
  AP_ATTACK: "madurai", AP_DEFENSE: "vazarin", AP_TACTIC: "naramon", AP_POWER: "zenurik",
  AP_PRECEPT: "penjaga", AP_WARD: "unairu", AP_UMBRA: "umbra", AP_UNIVERSAL: "any",
};

export const GAME_PREFIX = "game:";

// Configs A/B/C as the game keeps them: slots by index, then (by what sits there) stance, exilus, arcane.
// Innate polarities' places are not in the snapshot: each goes under the dearest mod of its polarity.
export function gameGearBuilds(ctx: GearCtx, id: string): [string, GearBuild][] {
  const lo = inventory.data?.loadouts?.[id];
  const g = ctx.items[id];
  if (!lo || !g) return [];
  const forma: GearPols = { slots: Array(g.slots).fill(null), exilus: g.exPol ?? null, stance: g.stPol ?? null };
  for (const [slot, ap] of lo.pol) {
    const p = AP[ap];
    if (!p) continue;
    if (slot < g.slots) forma.slots[slot] = p;
    else if (g.stance && slot === 8) forma.stance = p;
    else forma.exilus = p;
  }
  const out: [string, GearBuild][] = [];
  lo.cfg.forEach((c, i) => {
    const slots: ([string, number] | null)[] = Array(g.slots).fill(null);
    let exilus: [string, number] | null = null;
    let stance: [string, number] | null = null;
    const arcanes: string[] = [];
    c.m.forEach((e, k) => {
      if (!e) return;
      if (ctx.arcanes[e[0]]) arcanes.push(e[0]);
      else if (!ctx.mods[e[0]]) return;
      else if (ctx.mods[e[0]].stance) stance = e;
      else if (k < g.slots) slots[k] = e;
      else exilus = e;
    });
    if (!exilus && !stance && !arcanes.length && slots.every((s) => !s)) return;
    const ex = exilus as [string, number] | null;
    const st = stance as [string, number] | null;
    const pols = { ...forma, slots: placeInnate(ctx, g, forma.slots, slots) };
    out.push([
      `${GAME_PREFIX}${id}:${i}`,
      {
        item: id,
        title: c.n || t("frame.gameConfig", { c: String.fromCharCode(65 + i) }),
        author: t("frame.gameAuthor"),
        source: "game",
        slots: slots.map((s) => s?.[0] ?? null),
        exilus: ex?.[0] ?? null,
        stance: st?.[0] ?? null,
        arcanes,
        pols,
        ranks: { slots: slots.map((s) => s?.[1] ?? null), exilus: ex?.[1] ?? null, stance: st?.[1] ?? null },
        rank: xpRank(lo.xp || (inventory.xpOf(id) ?? 0), powersuit(g.kind), g.maxRank),
        catalyst: lo.potato,
      },
    ]);
  });
  return out;
}

function placeInnate(ctx: GearCtx, g: Gear, forma: (Polarity | null)[], mods: ([string, number] | null)[]): (Polarity | null)[] {
  const slots = [...forma];
  const free = (k: number) => !slots[k] && !forma[k];
  const cost = (k: number) => (mods[k] ? modCost(ctx.mods[mods[k]![0]], null, mods[k]![1]) : 0);
  const rest: Polarity[] = [];
  for (const p of g.pols) {
    const k = [...mods.keys()].filter((i) => free(i) && !!mods[i] && ctx.mods[mods[i]![0]].pol === p).sort((x, y) => cost(y) - cost(x))[0];
    if (k != null) slots[k] = p;
    else rest.push(p);
  }
  for (const p of rest) {
    const k = [...mods.keys()].sort((a, b) => Number(!!mods[a]) - Number(!!mods[b])).find(free);
    if (k != null) slots[k] = p;
  }
  return slots;
}
