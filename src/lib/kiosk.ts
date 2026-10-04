// Ducat kiosk hints (kiosk.rs reads the screen): OCR lines -> tiles of the grid -> prime parts ->
// what to do with each: keep for mastery, sell for platinum rather than ducats, or give to the kiosk.
// Positions are in the game's 1080p units times `s` (frame height / 1080), from the 16:9 area's left.
import { getDb, type Item } from "$lib/db";
import { bulkSell } from "$lib/api";
import { compact, lev } from "$lib/fuzzy";
import { allRewards, bestMatch } from "$lib/rewards";
import type { MasteryDb } from "$lib/mastery";
import type { Profile } from "$lib/profile.svelte";

export interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pass: number; // 0 gold-text pass, 1 colour pass
}

export interface KioskFrame {
  grid: OcrLine[];
  side: OcrLine[];
  badges: [number, number][]; // copy-count badge candidates (kiosk.rs), frame pixels
  w: number;
  h: number;
  ox: number;
  left: number;
  top: number;
}

// Grid measured on 1920x1080 frames.
const COL_X = 75;
const COL_STEP = 207.6;
const TILE = 190;
const GRID_TOP = 188;
const GRID_BOTTOM = 988;

export type Verdict = "mr" | "plat" | "ducats" | "even";

export interface Tile {
  x: number; // tile box in frame pixels
  y: number;
  size: number;
  id: string;
  item: Item;
  count: number; // copies owned: 2 means "2 or more" (the corner badge; its digit isn't read)
  plat: number | null;
  ducats: number;
  verdict: Verdict;
  spare: boolean; // needed for mastery, but there is more than one
  built: boolean; // a crafted warframe component (no "Blueprint" on the tile): not tradable
}

export interface Picked {
  id: string;
  item: Item;
  plat: number | null;
  needed: boolean; // for mastery, the last copy
}

const MIN_SCORE = 0.72;
const MARGIN = 0.06; // best match must beat the runner-up with another name by this much

// Lines of one tile: same column, stacked with small gaps. Returns groups of lines.
function stacks(lines: OcrLine[], s: number, ox: number): { col: number; lines: OcrLine[] }[] {
  const byCol = new Map<number, OcrLine[]>();
  for (const l of lines) {
    const cx = l.x + l.w / 2 - ox;
    const col = Math.round((cx / s - COL_X - TILE / 2) / COL_STEP);
    if (col < 0 || col > 5) continue;
    // Text must sit inside the tile's width (not in the gap between tiles).
    const left = (COL_X + col * COL_STEP) * s;
    if (cx < left - 6 * s || cx > left + (TILE + 6) * s) continue;
    (byCol.get(col) ?? byCol.set(col, []).get(col)!).push(l);
  }
  const out: { col: number; lines: OcrLine[] }[] = [];
  for (const [col, ls] of byCol) {
    ls.sort((a, b) => a.y - b.y);
    let cur: OcrLine[] = [];
    let bottom = -Infinity;
    for (const l of ls) {
      if (cur.length && l.y - bottom > 14 * s) {
        out.push({ col, lines: cur });
        cur = [];
      }
      cur.push(l);
      bottom = Math.max(bottom, l.y + l.h);
    }
    if (cur.length) out.push({ col, lines: cur });
  }
  return out;
}

export function readTiles(f: KioskFrame, lang: string, mdb: MasteryDb | null, profile: Profile | null): Tile[] {
  const s = f.h / 1080;
  const pool = allRewards(lang);
  const groups = stacks(f.grid, s, f.ox);
  debug = [];
  const tiles: Tile[] = [];
  for (const g of groups) {
    // Names are bottom-aligned: the tile ends just below the last line.
    const bottom = Math.max(...g.lines.map((l) => l.y + l.h)) + 6 * s;
    const top = bottom - TILE * s;
    if (top < (GRID_TOP - 12) * s || bottom > (GRID_BOTTOM + 8) * s) continue; // cut off by the scroll area
    // One reading per OCR pass, lines in order.
    const texts = [0, 1].map((p) => g.lines.filter((l) => l.pass === p).map((l) => l.text).join(" ")).filter(Boolean);
    const m = confident(texts, pool);
    if (!m) continue;
    const x = f.ox + (COL_X + g.col * COL_STEP) * s;
    // "✓ N" badge: only right at the tile's top left corner (elsewhere it is item art or name text).
    const badge = f.badges.some(([bx, by]) => Math.abs(bx - (x + 7 * s)) < 4 * s && by > top - 12 * s && by < top + 16 * s);
    const count = badge ? 2 : 1;
    const item = m.cand.item;
    // Relic rewards of warframe parts are blueprints; the same part crafted is sold here too, without
    // the word on the tile, and can't be traded — only kept or given for ducats.
    const built = !!item.bp && !item.main && !texts.some(isBlueprint);
    const plat = !built && item.slug ? (bulkSell(item.slug) ?? null) : null;
    const need = neededForMastery(item, mdb, profile);
    const spare = need && count > 1;
    const verdict: Verdict = need && !spare ? "mr" : built ? "ducats" : byPrice(plat, item.ducats ?? 0);
    tiles.push({ x, y: top, size: TILE * s, id: m.cand.id, item, count, plat, ducats: item.ducats ?? 0, verdict, spare, built });
  }
  return tiles;
}

// Best match only when it is clearly that one part (names over bright art lose words: "Чертёж: С…
// Прайм: Нейрооптика" fits a dozen parts — better no hint than a wrong one). The part's own name
// word must be read: the word matcher skips 1–2 letter words, so "Эш Прайм: Нейрооптика" would
// otherwise fit any unreadable neuroptics.
type Pool = ReturnType<typeof allRewards>;
const nameWords = (s: string) => s.toLowerCase().replace(/ё/g, "е").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const common = new WeakMap<Pool, Set<string>>();
function commonWords(pool: Pool): Set<string> {
  let set = common.get(pool);
  if (!set) {
    const df = new Map<string, number>();
    for (const c of pool) for (const w of new Set(nameWords(c.name))) df.set(w, (df.get(w) ?? 0) + 1);
    set = new Set([...df].filter(([, n]) => n > 6).map(([w]) => w));
    common.set(pool, set);
  }
  return set;
}
function ownNameRead(texts: string[], name: string, pool: Pool): boolean {
  const own = nameWords(name).filter((w) => !commonWords(pool).has(w));
  if (!own.length) return true;
  const read = texts.flatMap(nameWords);
  const flat = texts.map(compact).join(" ");
  return own.some((w) =>
    w.length <= 3 ? read.includes(w) : flat.includes(w.slice(0, 4)) || read.some((r) => 1 - lev(r, w) / Math.max(r.length, w.length) >= 0.7),
  );
}
// Part words read clearly ("система", "каркас", "ствол"...): a candidate without one is out —
// "Чертёж: Валькирия Прайм" must not win over "...: Система" because one OCR pass lost a line.
// ("Чертёж" is left to `isBlueprint`: the kiosk also lists built components without it.)
const BP_WORDS = new Set(["чертеж", "blueprint"]);
function partWordsRead(texts: string[], pool: Pool): string[] {
  const read = texts.flatMap(nameWords).filter((w) => w.length >= 4);
  return [...commonWords(pool)].filter(
    (w) => w.length >= 4 && !BP_WORDS.has(w) && read.some((r) => 1 - lev(r, w) / Math.max(r.length, w.length) >= 0.85),
  );
}
export let debug: unknown[] = [];
function confident(texts: string[], pool: Pool) {
  const parts = partWordsRead(texts, pool);
  const ok = pool.filter((c) => {
    if (!ownNameRead(texts, c.name, pool)) return false;
    const words = nameWords(c.name);
    return parts.every((w) => words.includes(w));
  });
  const best = bestMatch(texts, ok);
  const rest = best ? ok.filter((c) => c.id !== best.cand.id && c.name !== best.cand.name) : [];
  const second = best ? bestMatch(texts, rest) : null;
  debug.push({ texts, best: best?.cand.name, score: best?.score, second: second?.cand.name, s2: second?.score });
  if (!best || best.score < MIN_SCORE) return null;
  if (second && best.score - second.score < MARGIN) return null;
  return best;
}

// "Чертёж" / "Blueprint" on the tile, even cut ("ертёж", "Чер, ёж").
const isBlueprint = (text: string) => /черт|теж|чер.?ж|print/.test(text.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}]/gu, ""));

// Platinum against ducats: under 5 ducats per platinum it is worth more on the market; 10 and more
// per platinum is what Baro's ducats are for (same mark as the market tab's "ducats / platinum").
function byPrice(plat: number | null, ducats: number): Verdict {
  if (!plat || !ducats) return "even";
  const r = ducats / plat;
  if (r < 5 && plat >= 8) return "plat";
  if (r >= 10) return "ducats";
  return "even";
}

// The set this part builds was never leveled: building it gives mastery.
export function neededForMastery(item: Item, mdb: MasteryDb | null, profile: Profile | null): boolean {
  if (!item.set || !mdb || !profile) return false;
  const it = mdb.items[item.set];
  return !!it && !(profile.xp[item.set] > 0);
}

// The picked list on the right: "Чертёж: Харроу Прайм: Система   100" (the number may come apart).
export function readPicked(f: KioskFrame, lang: string, mdb: MasteryDb | null, profile: Profile | null, tiles: Tile[]): Picked[] {
  const pool = allRewards(lang);
  const out: Picked[] = [];
  for (const l of f.side) {
    const text = l.text.replace(/[\d\s]+$/, "").trim();
    if (compact(text).length < 6) continue;
    const m = bestMatch([text], pool);
    if (!m || m.score < 0.8) continue;
    const item = m.cand.item;
    const count = tiles.find((t) => t.id === m.cand.id)?.count ?? 1;
    const built = !!item.bp && !item.main && !isBlueprint(text);
    out.push({ id: m.cand.id, item, plat: !built && item.slug ? (bulkSell(item.slug) ?? null) : null, needed: neededForMastery(item, mdb, profile) && count < 2 });
  }
  return out;
}

export const partName = (id: string) => getDb().items[id]?.name ?? id;
