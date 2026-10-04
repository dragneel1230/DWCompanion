// Local game database built by scripts/build-data.mjs.
import { dataUrl, labels, t } from "$lib/i18n/index.svelte";

export type Rarity = "COMMON" | "UNCOMMON" | "RARE";

export interface Item {
  en: string;
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string; // in the interface language (static/data/<lang>/)
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
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string; // "Lith P9 Relic" / "Реликвия Лит P9"
  s: string; // short: "Lith P9" / "Лит P9"
  icon: string;
  vaulted: boolean;
  slug?: string;
  mname?: string;
  rewards: { id: string; rarity: Rarity; count: number }[];
}

export interface PrimeSet {
  en: string;
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
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
  projections: Record<string, string>; // "T1VoidProjectionProteaPrimeA" -> relic key
  // Keyed by the raw ids of DE's worldState.php.
  world: {
    regions: Record<string, { n: string; f: string; m: string | null }>; // SolNode126 -> node, faction, mission
    missionType: Record<string, string>; // MT_RESCUE -> "Rescue" / "Спасение"
    tier: Record<string, string>; // VoidT1 -> "Lith" / "Лит"
    byName: Record<string, string>; // "Martialis (Марс)" / "Martialis (Mars)" (client's EE.log) -> SolNode36
  };
}

export type EntryKind = "set" | "item" | "relic" | "frame" | "mod" | "arcane" | "resource" | "craft";

export interface Entry {
  kind: EntryKind;
  id: string;
  name: string; // shown, in the interface language
  ru: string;
  en: string;
  icon: string | null;
  vaulted?: boolean;
}

let db: Db | null = null;

// Latin letters as a Russian player would type them: "p9" -> "п9".
const CYR: Record<string, string> = {
  a: "а", b: "б", c: "с", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "ж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з",
};
const cyrillic = (s: string) => s.replace(/[a-z]/g, (c) => CYR[c]);
let entries: (Entry & { keys: string[] })[] = [];

// Lowercase, ё→е, drop punctuation: "Сарина Прайм: Каркас" -> "сарина прайм каркас".
export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function loadDb(): Promise<Db> {
  if (db) return db;
  const res = await fetch(dataUrl("db.json"));
  db = (await res.json()) as Db;

  for (const [id, s] of Object.entries(db.sets)) {
    entries.push({ kind: "set", id, name: s.name, ru: s.ru, en: s.en, icon: s.icon, keys: [normalize(s.ru), normalize(s.en)] });
  }
  for (const [id, it] of Object.entries(db.items)) {
    entries.push({ kind: "item", id, name: itemName(it), ru: it.ru, en: it.en, icon: it.icon, keys: [normalize(it.ru), normalize(it.en)] });
  }
  for (const [id, r] of Object.entries(db.relics)) {
    entries.push({
      kind: "relic", id, name: r.name, ru: r.ru, en: r.en, icon: r.icon, vaulted: r.vaulted,
      // "лит s18" and "lith s18" should both hit without typing the word "relic".
      // "лит п9" too: relic codes are Latin, players type them in Cyrillic.
      keys: [normalize(r.ru), normalize(r.en), normalize(`${r.era} ${r.cat}`), cyrillic(normalize(r.ru))],
    });
  }
  // Warframes, warframe mods and arcanes live in frames.json: added to search once it arrives.
  // (Imported lazily: frames.ts imports this module.)
  // Weapon / companion / archwing mods and stances (mods.json) are searched as mods too.
  import("$lib/frames")
    .then((m) => Promise.all([m.loadFrames(), m.loadOtherMods().catch(() => ({}))]))
    .then(([f, other]) => {
      const add = (kind: EntryKind, table: Record<string, { name: string; ru: string; en: string; icon: string | null }>) => {
        for (const [id, x] of Object.entries(table)) {
          entries.push({ kind, id, name: x.name, ru: x.ru, en: x.en, icon: x.icon, keys: [normalize(x.ru), normalize(x.en)] });
        }
      };
      // Same-named mods (Conclave versions etc.): keep the one on the market with more ranks.
      const mods = new Map<string, [string, (typeof f.mods)[string]]>();
      for (const [id, m] of [...Object.entries(f.mods), ...Object.entries(other)]) {
        const o = mods.get(m.ru)?.[1];
        if (!o || (!!m.slug > !!o.slug || (!!m.slug === !!o.slug && m.max > o.max))) mods.set(m.ru, [id, m]);
      }
      add("frame", f.frames);
      add("mod", Object.fromEntries(mods.values()));
      add("arcane", f.arcanes);
    })
    .catch(() => {});
  // Weapons, companions, gear: from craft.json, except what search already has (frames, prime sets).
  Promise.all([import("$lib/craft").then((m) => m.loadCraft()), import("$lib/frames").then((m) => m.loadFrames())])
    .then(([c, f]) => {
      for (const [id, x] of Object.entries(c.items)) {
        if (x.kind === "part" || x.kind === "resource" || f.frames[id] || db!.sets[id]) continue;
        entries.push({ kind: "craft", id, name: x.name, ru: x.ru, en: x.en, icon: x.icon, keys: [normalize(x.ru), normalize(x.en)] });
      }
    })
    .catch(() => {});
  // Resources come with drops.json (Resources tab).
  import("$lib/drops")
    .then((m) => m.loadDrops())
    .then((d) => {
      for (const [id, r] of Object.entries(d.resources)) {
        entries.push({ kind: "resource", id, name: r.name, ru: r.ru, en: r.en, icon: r.icon, keys: [normalize(r.ru), normalize(r.en)] });
      }
    })
    .catch(() => {});
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("db not loaded");
  return db;
}

// Parts of a set without repeats: dual weapons take the same part twice (Akbronko Prime: 2 × Bronco
// Prime). Lists key rows by part id, so a repeated id must become a count.
export function setParts(set: PrimeSet): { id: string; count: number }[] {
  const by = new Map<string, number>();
  for (const p of set.parts) by.set(p, (by.get(p) ?? 0) + 1);
  return [...by].map(([id, count]) => ({ id, count }));
}

// Node key of a mission place as the game client wrote it in EE.log: "Martialis (Марс) - Разрыв: Лит" -> "SolNode36".
// The client's language may differ from the interface's: show the node's name from the data instead.
export function nodeOfMission(missionName: string | null | undefined): string | undefined {
  const place = missionName?.split(" - ")[0]?.trim();
  return place ? getDb().world.byName[place] : undefined;
}

// Main blueprint shares the set's name, make it distinguishable.
export function itemName(it: Item): string {
  return it.main ? t("item.mainBlueprint", { name: it.name }) : it.name;
}

const KIND_WEIGHT: Record<EntryKind, number> = { set: 3, frame: 2.5, item: 2, mod: 2, arcane: 2, resource: 2, craft: 1.8, relic: 1 };

// Every query word must match a word of the key (any order): whole word 4, prefix 3, typo 1.
// Typos: one edit (swap, missing, extra or wrong letter) in the prefix, two for words of 7+ letters.
// A word typed without spaces ("саринапрайм") matches the key with spaces dropped.
function scoreKey(key: string, qWords: string[]): number {
  const words = key.split(" ");
  let score = 0;
  for (const q of qWords) {
    let best = 0;
    for (const w of words) {
      if (w === q) best = 4;
      else if (w.startsWith(q)) best = Math.max(best, 3);
      else if (best < 1 && q.length >= 4 && prefixEdits(w, q) <= (q.length >= 7 ? 2 : 1)) best = 1;
      if (best === 4) break;
    }
    if (!best && q.length >= 6 && key.replace(/ /g, "").startsWith(q)) best = 2;
    if (!best) return 0;
    score += best;
  }
  return score;
}

// Fewest edits (Damerau: substitution, insertion, deletion, adjacent swap) turning q into some
// prefix of w. Early out above 2.
function prefixEdits(w: string, q: string): number {
  const n = q.length;
  const m = Math.min(w.length, n + 2);
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let best = prev[m];
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = q[i - 1] === w[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && q[i - 1] === w[j - 2] && q[i - 2] === w[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > 2) return 3;
    prev2 = prev;
    prev = cur;
    best = Math.min(...cur.slice(Math.max(1, n - 2)));
  }
  return best;
}

// Typed in the wrong keyboard layout: "cfhbyf" -> "сарина", "ыфкшиф" -> "sarina".
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбюё";
const toRu = new Map([...EN_KEYS].map((c, i) => [c, RU_KEYS[i]]));
const toEn = new Map([...RU_KEYS].map((c, i) => [c, EN_KEYS[i]]));
function swapLayout(s: string): string | null {
  const lower = s.toLowerCase();
  const latin = /[a-z]/.test(lower) && !/[а-яё]/.test(lower);
  const map = latin ? toRu : /[а-яё]/.test(lower) && !/[a-z]/.test(lower) ? toEn : null;
  return map ? [...lower].map((c) => map.get(c) ?? c).join("") : null;
}

// Player slang and short forms, whole query words only. "" drops the word: every part here is
// a blueprint anyway, so "бп" should not filter anything out.
const SLANG: Record<string, string> = {
  бп: "", bp: "", чертеж: "", blueprint: "", нейронка: "нейрооптика", нейра: "нейрооптика", сет: "набор", сета: "набор",
  систа: "система", neuro: "neuroptics", sys: "systems", п: "прайм", p: "prime",
};

function scoreQuery(qWords: string[]): { e: Entry; s: number }[] {
  const hits: { e: Entry; s: number }[] = [];
  for (const e of entries) {
    let s = 0;
    for (const k of e.keys) s = Math.max(s, scoreKey(k, qWords));
    if (!s) continue;
    // Prefer sets, then shorter names (closer match), then active relics.
    hits.push({ e, s: s * 10 + KIND_WEIGHT[e.kind] - e.name.length * 0.01 - (e.vaulted ? 1 : 0) });
  }
  return hits;
}

const queryWords = (q: string) => {
  const all = normalize(q).split(" ").filter(Boolean);
  const kept = all.map((w) => SLANG[w] ?? w).filter(Boolean);
  return kept.length ? kept : all; // "чертеж" alone still searches for itself
};

// The same matching (typos, slang, wrong layout) over any list with normalized `keys`, best first.
export function searchList<T extends { keys: string[] }>(list: T[], query: string, weight: (x: T) => number = () => 0): T[] {
  const run = (q: string) => {
    const w = queryWords(q);
    if (!w.length) return [];
    return list.flatMap((x) => {
      let s = 0;
      for (const k of x.keys) s = Math.max(s, scoreKey(k, w));
      return s ? [{ x, s: s * 10 + weight(x) }] : [];
    });
  };
  const best = new Map<T, number>();
  for (const h of run(query)) best.set(h.x, h.s);
  const swapped = swapLayout(query);
  if (swapped) for (const h of run(swapped)) if ((best.get(h.x) ?? -Infinity) < h.s - 5) best.set(h.x, h.s - 5);
  return [...best].sort((a, b) => b[1] - a[1]).map(([x]) => x);
}

export function search(query: string, limit = 30): Entry[] {
  const words = queryWords;
  const qWords = words(query);
  if (!qWords.length) return [];
  const best = new Map<Entry, number>();
  const add = (list: { e: Entry; s: number }[], penalty: number) => {
    for (const h of list) if ((best.get(h.e) ?? -Infinity) < h.s - penalty) best.set(h.e, h.s - penalty);
  };
  add(scoreQuery(qWords), 0);
  // The other layout is tried too; a direct match of the same strength wins.
  const swapped = swapLayout(query);
  if (swapped) {
    const sw = words(swapped);
    if (sw.length) add(scoreQuery(sw), 5);
  }
  return [...best]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([e]) => e);
}

export function iconUrl(path: string | null): string {
  if (!path) return "";
  return path.startsWith("http") ? path : `https://browse.wf${path}`;
}

export const RARITY_RU = labels<Rarity>({ COMMON: "rarity.common", UNCOMMON: "rarity.uncommon", RARE: "rarity.rare" });
