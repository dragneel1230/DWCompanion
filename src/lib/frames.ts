// Warframes, mods and builds (static/data/frames.json, built by scripts/build-frames.mjs).
import { normalize } from "$lib/db";
import { userBuilds } from "$lib/userBuilds.svelte";
import { overframeIds, type DecodedBuild } from "$lib/overframe.svelte";

export type Polarity = "madurai" | "vazarin" | "naramon" | "zenurik" | "penjaga" | "unairu" | "umbra" | "any";
export type ModRarity = "Common" | "Uncommon" | "Rare" | "Legendary" | "Peculiar";

export interface Ability {
  ru: string;
  en: string;
  desc: string;
  icon: string | null;
}

export interface Frame {
  ru: string;
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
}

export interface Mod {
  ru: string;
  en: string;
  icon: string | null;
  pol: Polarity;
  rarity: ModRarity;
  drain: number;
  max: number;
  stats: string;
  aura?: boolean;
  exilus?: boolean;
  augment?: string;
}

export interface Arcane {
  ru: string;
  en: string;
  icon: string | null;
  rarity: ModRarity;
  max: number;
  stats: string;
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
  pols?: { aura: Polarity | null; exilus: Polarity | null; slots: (Polarity | null)[] };
}

export interface FramesDb {
  frames: Record<string, Frame>;
  mods: Record<string, Mod>;
  arcanes: Record<string, Arcane>;
  builds: Record<string, Build>;
}

let cache: Promise<FramesDb> | null = null;

// Loaded lazily: only the Warframes tab needs it.
export function loadFrames(): Promise<FramesDb> {
  cache ??= fetch("/data/frames.json").then((r) => r.json() as Promise<FramesDb>);
  return cache;
}

export function searchFrames(db: FramesDb, query: string): [string, Frame][] {
  const q = normalize(query);
  const list = Object.entries(db.frames);
  const hits = q
    ? list.filter(([, f]) => normalize(f.ru).includes(q) || normalize(f.en).includes(q))
    : list;
  return hits.sort(([, a], [, b]) => a.ru.localeCompare(b.ru, "ru"));
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

// Mod drain at max rank; a matching slot polarity halves it (rounded up), a mismatch adds 25%.
// Auras give capacity instead: returned as a negative number, doubled in a matching aura slot.
export function modCost(mod: Mod, slotPol?: Polarity | null): number {
  if (mod.aura) {
    const bonus = Math.abs(mod.drain) + mod.max;
    return -(slotPol === mod.pol ? bonus * 2 : bonus);
  }
  const full = mod.drain + mod.max;
  if (!slotPol) return full;
  if (slotPol === mod.pol || slotPol === "any") return Math.ceil(full / 2);
  return Math.round(full * 1.25);
}

export const POLARITY_RU: Record<Polarity, string> = {
  madurai: "Мадурай", vazarin: "Вазарин", naramon: "Нарамон", zenurik: "Зенурик",
  penjaga: "Пенджага", unairu: "Унайру", umbra: "Умбра", any: "Любая",
};

export const RARITY_RU: Record<ModRarity, string> = {
  Common: "Обычный", Uncommon: "Необычный", Rare: "Редкий", Legendary: "Легендарный", Peculiar: "Особый",
};

// ---------- Overframe import

export interface ImportResult {
  build: Omit<Build, "title" | "author" | "votes" | "note" | "tags"> | null;
  frameId: string | null;
  unknown: number[];
  total: number;
}

function byEnName(table: Record<string, { en: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, v] of Object.entries(table)) if (!m.has(v.en)) m.set(v.en, id);
  return m;
}

// Third field of an Overframe entry = forma'd slot polarity. Checked on a real build:
// 1 madurai, 2 vazarin, 3 naramon, 9 zenurik. Unairu / penjaga / umbra codes are not known yet.
const OVERFRAME_POLARITY: Record<number, Polarity> = { 1: "madurai", 2: "vazarin", 3: "naramon", 9: "zenurik" };

// Warframe capacity with an Orokin Reactor at rank 30.
export const BASE_CAPACITY = 60;

// Maps Overframe ids to our uniqueNames and lays entries out into slots.
export function assembleImport(db: FramesDb, dec: DecodedBuild, fallbackFrame: string): ImportResult {
  const mods = byEnName(db.mods);
  const arcanes = byEnName(db.arcanes);
  const frames = byEnName(db.frames);

  const frameName = overframeIds.name(dec.itemId);
  const frameId = (frameName && frames.get(frameName)) || fallbackFrame || null;

  const unknown: number[] = [];
  const pols: NonNullable<Build["pols"]> = { aura: null, exilus: null, slots: Array(8).fill(null) };
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
    } else if (db.mods[modId!].aura) {
      aura = modId!;
      pols.aura = pol;
    } else {
      exilus = modId!;
      pols.exilus = pol;
    }
  });

  return {
    build: frameId ? { frame: frameId, aura, exilus, slots, arcanes: arc, pols, source: "overframe", url: dec.url ?? undefined } : null,
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
