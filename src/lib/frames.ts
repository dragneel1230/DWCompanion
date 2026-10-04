// Warframes, mods and builds (static/data/frames.json, built by scripts/build-frames.mjs).
import { normalize } from "$lib/db";
import { dataUrl, labels, locale } from "$lib/i18n/index.svelte";
import { userBuilds } from "$lib/userBuilds.svelte";
import { overframeIds, type DecodedBuild } from "$lib/overframe.svelte";

export type Polarity = "madurai" | "vazarin" | "naramon" | "zenurik" | "penjaga" | "unairu" | "umbra" | "any";
export type ModRarity = "Common" | "Uncommon" | "Rare" | "Legendary" | "Peculiar";

export interface Ability {
  name: string;
  en: string;
  desc: string;
  icon: string | null;
}

export interface Frame {
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  en: string;
  icon: string;
  prime: boolean;
  health: number;
  shield: number;
  armor: number;
  energy: number;
  sprint: number;
  aura: Polarity | null;
  polarities: Polarity[];
  released: string | null;
  passive: string;
  abilities: Ability[];
  r30: { health: number; shield: number; energy: number; armor: number }; // DE's rank-30 scaling
  desc: string;
  parts: { name: string; bp?: boolean; drops: { loc: string; chance: number }[] }[]; // non-prime only
  bpCost?: number; // market blueprint price, credits
}

export type FxKey = "str" | "dur" | "rng" | "eff" | "hp" | "hpFlat" | "sh" | "shFlat" | "shMul" | "arm" | "en" | "spd";

export interface ModSet {
  desc: string;
  n: number; // mods in the full set
  values: number[]; // bonus with 2, 3, ... set mods equipped
}

export interface Mod {
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  en: string;
  icon: string | null;
  pol: Polarity;
  rarity: ModRarity;
  drain: number;
  max: number;
  stats: string;
  levels: string[]; // stat text per rank
  fx?: Partial<Record<FxKey, number[]>>; // numeric effects per rank
  set?: string;
  aura?: boolean;
  exilus?: boolean;
  augment?: string;
  slug?: string;
  mname?: string;
  cat?: string; // mods.json only: PRIMARY, SECONDARY, MELEE, STANCE, ARCH-GUN...
}

export interface Arcane {
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  en: string;
  icon: string | null;
  rarity: ModRarity;
  max: number;
  stats: string;
  levels: string[];
  wf?: boolean; // usable on warframes
  slug?: string;
  mname?: string;
}

export interface BuildRanks {
  aura: number | null;
  exilus: number | null;
  slots: (number | null)[];
}

export interface Build {
  frame: string;
  title: string;
  author: string;
  votes: number;
  demo?: boolean;
  note: string;
  tags: string[];
  aura: string | null;
  exilus: string | null;
  slots: (string | null)[];
  arcanes: string[];
  source?: "overframe";
  url?: string;
  // Forma'd slot polarities, when known (Overframe import carries them).
  pols?: BuildPols;
  // Mod ranks; missing = max rank.
  ranks?: BuildRanks;
  // Frame rank and reactor, for capacity.
  rank?: number;
  reactor?: boolean;
}

export interface BuildPols {
  aura: Polarity | null;
  exilus: Polarity | null;
  slots: (Polarity | null)[];
}

export interface FramesDb {
  frames: Record<string, Frame>;
  mods: Record<string, Mod>;
  arcanes: Record<string, Arcane>;
  builds: Record<string, Build>;
  sets: Record<string, ModSet>;
  modNames: Record<string, string[]>; // Russian name -> ids, every mod type
}

let cache: Promise<FramesDb> | null = null;

// Loaded lazily: only the Warframes tab needs it.
export function loadFrames(): Promise<FramesDb> {
  cache ??= fetch(dataUrl("frames.json")).then((r) => r.json() as Promise<FramesDb>);
  return cache;
}

// Every other mod (weapons, companions, archwing, stances): static/data/<lang>/mods.json, same shape.
let other: Promise<Record<string, Mod>> | null = null;
export function loadOtherMods(): Promise<Record<string, Mod>> {
  other ??= fetch(dataUrl("mods.json"))
    .then((r) => r.json() as Promise<{ mods: Record<string, Mod> }>)
    .then((d) => d.mods);
  other.catch(() => (other = null));
  return other;
}

export function searchFrames(db: FramesDb, query: string): [string, Frame][] {
  const q = normalize(query);
  const list = Object.entries(db.frames);
  const hits = q
    ? list.filter(([, f]) => normalize(f.ru).includes(q) || normalize(f.en).includes(q))
    : list;
  return hits.sort(([, a], [, b]) => a.name.localeCompare(b.name, locale()));
}

// Bundled builds plus the ones the user imported (saved locally).
export function getBuild(db: FramesDb, id: string): Build | undefined {
  return userBuilds.all[id] ?? db.builds[id];
}

export function buildsFor(db: FramesDb, frameId: string): [string, Build][] {
  return Object.entries({ ...db.builds, ...userBuilds.all })
    .filter(([, b]) => b.frame === frameId)
    .sort(([, a], [, b]) => b.votes - a.votes);
}

// Mod drain at a rank (default max); a matching slot polarity halves it (rounded up), a mismatch adds 25%.
// Auras give capacity instead: returned as a negative number, doubled in a matching aura slot.
export function modCost(mod: Mod, slotPol?: Polarity | null, rank = mod.max): number {
  if (mod.aura) {
    const bonus = Math.abs(mod.drain) + rank;
    return -(slotPol === mod.pol || slotPol === "any" ? bonus * 2 : bonus);
  }
  const full = mod.drain + rank;
  if (!slotPol) return full;
  if (slotPol === mod.pol || slotPol === "any") return Math.ceil(full / 2);
  return Math.round(full * 1.25);
}

export const POLARITY_RU = labels<Polarity>({
  madurai: "focus.madurai", vazarin: "focus.vazarin", naramon: "focus.naramon", zenurik: "focus.zenurik",
  penjaga: "polarity.penjaga", unairu: "focus.unairu", umbra: "polarity.umbra", any: "polarity.any",
});

export const RARITY_RU = labels<ModRarity>({
  Common: "modRarity.common", Uncommon: "modRarity.uncommon", Rare: "modRarity.rare", Legendary: "modRarity.legendary", Peculiar: "modRarity.peculiar",
});

export const SLOT_POLARITIES: Polarity[] = ["madurai", "vazarin", "naramon", "zenurik", "unairu", "penjaga", "umbra"];

// Innate layout for a fresh build: aura as the game has it, innate slot polarities from the left.
export function innatePols(frame: Frame): BuildPols {
  return {
    aura: frame.aura,
    exilus: null,
    slots: Array.from({ length: 8 }, (_, i) => frame.polarities[i] ?? null),
  };
}

// Forma count. When polarizing, the game lets you move innate polarities to any slot for free,
// so a slot costs a Forma only when its polarity is not covered by the frame's innate set.
// Checked on Saryn Prime (innate: aura V, slots - D V): Overframe build with 4 Forma matches.
export function formaInfo(frame: Frame, pols: BuildPols | undefined) {
  const p = pols ?? innatePols(frame);
  const pool = [...frame.polarities];
  // Left to right: a slot is free while the innate pool still has its polarity.
  const slots = p.slots.map((pol) => {
    if (!pol) return false;
    const i = pool.indexOf(pol);
    if (i < 0) return true;
    pool.splice(i, 1);
    return false;
  });
  const aura = !!p.aura && p.aura !== frame.aura;
  const exilus = !!p.exilus;
  return { count: slots.filter(Boolean).length + (aura ? 1 : 0) + (exilus ? 1 : 0), aura, exilus, slots };
}

// Endo to fuse a mod from 0 to a rank: base by rarity × (2^rank − 1).
const ENDO_BASE: Record<ModRarity, number> = { Common: 10, Uncommon: 20, Rare: 30, Legendary: 40, Peculiar: 30 };
export const endoCost = (mod: Mod, rank: number) => ENDO_BASE[mod.rarity] * (2 ** rank - 1);

export const rankOf = (mod: Mod, r: number | null | undefined) => Math.min(r ?? mod.max, mod.max);

// Every equipped mod with its slot polarity and rank.
export function equipped(db: FramesDb, b: Build) {
  const out: { id: string; mod: Mod; rank: number; pol: Polarity | null; kind: "aura" | "exilus" | "slot" }[] = [];
  const add = (id: string | null, pol: Polarity | null | undefined, r: number | null | undefined, kind: "aura" | "exilus" | "slot") => {
    const mod = id ? db.mods[id] : undefined;
    if (id && mod) out.push({ id, mod, rank: rankOf(mod, r), pol: pol ?? null, kind });
  };
  add(b.aura, b.pols?.aura, b.ranks?.aura, "aura");
  add(b.exilus, b.pols?.exilus, b.ranks?.exilus, "exilus");
  b.slots.forEach((m, i) => add(m, b.pols?.slots[i], b.ranks?.slots[i], "slot"));
  return out;
}

export function buildEndo(db: FramesDb, b: Build) {
  return equipped(db, b).reduce((sum, e) => sum + endoCost(e.mod, e.rank), 0);
}

// Capacity like the in-game counter: frame rank (doubled by a reactor) + aura bonus, minus drains.
export function buildCapacity(db: FramesDb, b: Build) {
  let total = (b.rank ?? 30) * (b.reactor === false ? 1 : 2);
  let used = 0;
  for (const e of equipped(db, b)) {
    const c = modCost(e.mod, e.pol, e.rank);
    if (e.kind === "aura") total -= c;
    else used += c;
  }
  return { used, total };
}

// Set bonus multiplier per set: 1 + bonus for the number of set mods equipped.
export function setCounts(db: FramesDb, b: Build) {
  const n: Record<string, number> = {};
  for (const e of equipped(db, b)) if (e.mod.set) n[e.mod.set] = (n[e.mod.set] ?? 0) + 1;
  return n;
}
const setMul = (db: FramesDb, set: string | undefined, counts: Record<string, number>) =>
  set ? 1 + (db.sets[set]?.values[(counts[set] ?? 0) - 2] ?? 0) : 1;

// Stat value of a mod at a rank, with its set bonus.
export function modFx(db: FramesDb, mod: Mod, rank: number, counts: Record<string, number>) {
  const out: Partial<Record<FxKey, number>> = {};
  const mul = setMul(db, mod.set, counts);
  for (const [k, v] of Object.entries(mod.fx ?? {}) as [FxKey, number[]][]) out[k] = (v[rank] ?? 0) * (k === "shMul" ? 1 : mul);
  return out;
}

// Warframe stats at rank 30 with the build's mods (unconditional stat lines only).
export function buildStats(db: FramesDb, frame: Frame, b: Build) {
  const counts = setCounts(db, b);
  const sum: Record<FxKey, number> = { str: 0, dur: 0, rng: 0, eff: 0, hp: 0, hpFlat: 0, sh: 0, shFlat: 0, shMul: 0, arm: 0, en: 0, spd: 0 };
  let shMul = 1;
  for (const e of equipped(db, b)) {
    for (const [k, v] of Object.entries(modFx(db, e.mod, e.rank, counts)) as [FxKey, number][]) {
      if (k === "shMul") shMul *= v;
      else sum[k] += v;
    }
  }
  const r = frame.r30;
  const health = r.health * (1 + sum.hp / 100) + sum.hpFlat;
  const shield = (r.shield * (1 + sum.sh / 100) + sum.shFlat) * shMul;
  const armor = r.armor * (1 + sum.arm / 100);
  const dr = armor / (armor + 300);
  return {
    health,
    shield,
    energy: r.energy * (1 + sum.en / 100),
    sprint: frame.sprint * (1 + sum.spd / 100),
    armor,
    dr,
    ehp: health / (1 - dr) + shield,
    str: 100 + sum.str,
    dur: 100 + sum.dur,
    rng: 100 + sum.rng,
    eff: 100 + sum.eff,
  };
}

export function emptyBuild(frameId: string, frame: Frame): Build {
  return {
    frame: frameId,
    title: "",
    author: "",
    votes: 0,
    note: "",
    tags: [],
    aura: null,
    exilus: null,
    slots: Array(8).fill(null),
    arcanes: [],
    pols: innatePols(frame),
    ranks: { aura: null, exilus: null, slots: Array(8).fill(null) },
    rank: 30,
    reactor: true,
  };
}

// Same-named variants (Conclave, old versions): the tradable one with more ranks is the real mod.
const betterMod = (a: Mod, b: Mod) => (!!a.slug !== !!b.slug ? !!a.slug : a.max > b.max);

// Mods that fit a slot: auras only in the aura slot, exilus-capable mods in exilus, augments only
// for their frame. Same-named duplicates (the game has a few) are collapsed.
export function modsForSlot(db: FramesDb, frame: Frame, kind: "aura" | "exilus" | "slot") {
  const base = frame.en.replace(/ Prime$/, "").toUpperCase();
  const best = new Map<string, [string, Mod]>();
  for (const [id, m] of Object.entries(db.mods)) {
    if (kind === "aura" ? !m.aura : m.aura) continue;
    if (kind === "exilus" && !m.exilus) continue;
    if (m.augment && m.augment !== base) continue;
    const prev = best.get(m.en);
    if (!prev || betterMod(m, prev[1])) best.set(m.en, [id, m]);
  }
  return [...best.values()].sort(([, a], [, b]) => a.name.localeCompare(b.name, locale()));
}

// ---------- Overframe import

export interface ImportResult {
  build: Omit<Build, "title" | "author" | "votes" | "note" | "tags"> | null;
  frameId: string | null;
  unknown: number[];
  total: number;
}

function byEnName<T extends { en: string }>(table: Record<string, T>, better?: (a: T, b: T) => boolean): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, v] of Object.entries(table)) {
    const prev = m.get(v.en);
    if (!prev || better?.(v, table[prev])) m.set(v.en, id);
  }
  return m;
}

// Third field of an Overframe entry = forma'd slot polarity. Checked on a real build:
// 1 madurai, 2 vazarin, 3 naramon, 8 umbra, 9 zenurik. Unairu / penjaga codes are not known yet.
const OVERFRAME_POLARITY: Record<number, Polarity> = { 1: "madurai", 2: "vazarin", 3: "naramon", 8: "umbra", 9: "zenurik" };


// Maps Overframe ids to our uniqueNames and lays entries out into slots.
export function assembleImport(db: FramesDb, dec: DecodedBuild, fallbackFrame: string): ImportResult {
  const mods = byEnName(db.mods, betterMod);
  const arcanes = byEnName(db.arcanes);
  const frames = byEnName(db.frames);

  const frameName = overframeIds.name(dec.itemId);
  const frameId = (frameName && frames.get(frameName)) || fallbackFrame || null;

  const unknown: number[] = [];
  const pols: BuildPols = { aura: null, exilus: null, slots: Array(8).fill(null) };
  const ranks: BuildRanks = { aura: null, exilus: null, slots: Array(8).fill(null) };
  const slots: (string | null)[] = Array(8).fill(null);
  let aura: string | null = null;
  let exilus: string | null = null;
  const arc: string[] = [];

  dec.entries.forEach((e, i) => {
    const name = overframeIds.name(e.id);
    const modId = name ? mods.get(name) : undefined;
    const arcId = name ? arcanes.get(name) : undefined;
    if (!modId && !arcId) {
      unknown.push(e.id);
      return;
    }
    const pol = OVERFRAME_POLARITY[e.pol] ?? null;
    if (arcId) arc.push(arcId);
    else if (i < 8) {
      slots[i] = modId!;
      pols.slots[i] = pol;
      ranks.slots[i] = e.rank;
    } else if (db.mods[modId!].aura) {
      aura = modId!;
      pols.aura = pol;
      ranks.aura = e.rank;
    } else {
      exilus = modId!;
      pols.exilus = pol;
      ranks.exilus = e.rank;
    }
  });

  return {
    build: frameId ? { frame: frameId, aura, exilus, slots, arcanes: arc, pols, ranks, source: "overframe", url: dec.url ?? undefined } : null,
    frameId,
    unknown,
    total: dec.entries.length,
  };
}

// Mods and arcanes by Russian or English name, for resolving unknown Overframe ids by hand.
export function searchModsAndArcanes(db: FramesDb, query: string, limit = 6): { id: string; en: string; ru: string; icon: string | null }[] {
  const q = normalize(query);
  if (!q) return [];
  const out: { id: string; en: string; ru: string; icon: string | null }[] = [];
  const seen = new Set<string>(); // the game has a few same-named duplicates; import matches by name anyway
  for (const table of [db.mods, db.arcanes]) {
    for (const [id, v] of Object.entries(table)) {
      if (seen.has(v.en)) continue;
      if (normalize(v.ru).includes(q) || normalize(v.en).includes(q)) {
        seen.add(v.en);
        out.push({ id, en: v.en, ru: v.ru, icon: v.icon });
      }
      if (out.length >= limit) return out;
    }
  }
  return out;
}
