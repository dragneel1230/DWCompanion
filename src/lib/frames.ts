// Warframes, mods and builds (static/data/frames.json, built by scripts/build-frames.mjs).
import { normalize } from "$lib/db";

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

export function buildsFor(db: FramesDb, frameId: string): [string, Build][] {
  return Object.entries(db.builds)
    .filter(([, b]) => b.frame === frameId)
    .sort(([, a], [, b]) => b.votes - a.votes);
}

// Mod drain at max rank; a matching slot polarity halves it (rounded up), a mismatch adds 25%.
// Auras have negative base drain and give capacity instead: returned as a negative number.
export function modCost(mod: Mod, slotPol?: Polarity | null): number {
  if (mod.aura) return -(Math.abs(mod.drain) + mod.max);
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
