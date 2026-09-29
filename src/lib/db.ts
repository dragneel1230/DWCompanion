// Local game database built by scripts/build-data.mjs.

export type Rarity = "COMMON" | "UNCOMMON" | "RARE";

export interface Item {
  en: string;
  ru: string;
  bp?: boolean;
  main?: boolean;
  icon: string | null;
  ducats?: number;
  slug?: string;
  mname?: string;
  set?: string;
  relics: { relic: string; rarity: Rarity }[];
}

export interface Relic {
  era: string;
  cat: string;
  en: string;
  ru: string;
  icon: string;
  vaulted: boolean;
  slug?: string;
  mname?: string;
  rewards: { id: string; rarity: Rarity; count: number }[];
}

export interface PrimeSet {
  en: string;
  ru: string;
  icon: string;
  slug: string;
  mname?: string;
  parts: string[];
}

export interface Db {
  builtAt: string;
  items: Record<string, Item>;
  relics: Record<string, Relic>;
  sets: Record<string, PrimeSet>;
  // Keyed by the raw ids of DE's worldState.php.
  world: {
    regions: Record<string, { n: string; f: string; m: string | null }>; // SolNode126 -> node, faction, mission
    missionType: Record<string, string>; // MT_RESCUE -> "Спасение"
    tier: Record<string, string>; // VoidT1 -> "Лит"
  };
}

export type EntryKind = "set" | "item" | "relic";

export interface Entry {
  kind: EntryKind;
  id: string;
  ru: string;
  en: string;
  icon: string | null;
  vaulted?: boolean;
}

let db: Db | null = null;
let entries: (Entry & { keys: string[] })[] = [];

// Lowercase, ё→е, drop punctuation: "Сарина Прайм: Каркас" -> "сарина прайм каркас".
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function loadDb(): Promise<Db> {
  if (db) return db;
  const res = await fetch("/data/db.json");
  db = (await res.json()) as Db;

  for (const [id, s] of Object.entries(db.sets)) {
    entries.push({ kind: "set", id, ru: s.ru, en: s.en, icon: s.icon, keys: [normalize(s.ru), normalize(s.en)] });
  }
  for (const [id, it] of Object.entries(db.items)) {
    const ru = itemName(it);
    entries.push({ kind: "item", id, ru, en: it.en, icon: it.icon, keys: [normalize(ru), normalize(it.en)] });
  }
  for (const [id, r] of Object.entries(db.relics)) {
    entries.push({
      kind: "relic", id, ru: r.ru, en: r.en, icon: r.icon, vaulted: r.vaulted,
      // "лит s18" and "lith s18" should both hit without typing the word "relic".
      keys: [normalize(r.ru), normalize(r.en), normalize(`${r.era} ${r.cat}`)],
    });
  }
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("db not loaded");
  return db;
}

// Main blueprint shares the set's name, make it distinguishable.
export function itemName(it: Item): string {
  return it.main ? `${it.ru}: чертёж` : it.ru;
}

const KIND_WEIGHT: Record<EntryKind, number> = { set: 3, item: 2, relic: 1 };

// Every query word must be a prefix of some word in the key (any order).
// Falls back to a one-typo match per word so "сорина" still finds "сарина".
function scoreKey(key: string, qWords: string[]): number {
  const words = key.split(" ");
  let score = 0;
  for (const q of qWords) {
    let best = 0;
    for (const w of words) {
      if (w === q) best = Math.max(best, 4);
      else if (w.startsWith(q)) best = Math.max(best, 3);
      else if (q.length >= 4 && w.length >= q.length && withinOneEdit(w.slice(0, q.length), q)) best = Math.max(best, 1);
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}

function withinOneEdit(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return true;
}

export function search(query: string, limit = 30): Entry[] {
  const qWords = normalize(query).split(" ").filter(Boolean);
  if (!qWords.length) return [];
  const hits: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    let s = 0;
    for (const k of e.keys) s = Math.max(s, scoreKey(k, qWords));
    if (!s) continue;
    // Prefer sets, then shorter names (closer match), then active relics.
    hits.push({ e, s: s * 10 + KIND_WEIGHT[e.kind] - e.ru.length * 0.01 - (e.vaulted ? 1 : 0) });
  }
  hits.sort((a, b) => b.s - a.s);
  return hits.slice(0, limit).map((h) => h.e);
}

export function iconUrl(path: string | null): string {
  if (!path) return "";
  return path.startsWith("http") ? path : `https://browse.wf${path}`;
}

export const RARITY_RU: Record<Rarity, string> = { COMMON: "Обычная", UNCOMMON: "Необычная", RARE: "Редкая" };
