// Mod names in OCR text lines of the in-game Mods screen. Pure: tested on saved OCR output
// (scripts/test-modmatch.mjs) as well as used by the live scan.
//
// Seen on real frames (1080p, Russian client): names wrap onto 2-3 lines, even mid-word
// ("Гальванизированн / ый Двойной Ствол"); 3-line names are clipped by the card frame; OCR adds
// junk at the ends ("(", "—2", ",х") and mixes Latin look-alikes into Cyrillic words.
import { compact, levInside, levPrefix } from "$lib/fuzzy";

export interface Line {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pass: number; // OCR preparation that produced the line
}

export interface Entry {
  name: string;
  key: string;
  ids: string[];
}

export interface Index {
  byKey: Map<string, Entry>;
  all: Entry[];
}

// Latin letters OCR puts in place of the Cyrillic ones that look the same.
const LOOKALIKE: Record<string, string> = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к", m: "м", t: "т", h: "н", b: "в",
};
export const modKey = (s: string) => compact(s).replace(/[a-z]/g, (c) => LOOKALIKE[c] ?? c);

export function buildIndex(names: Record<string, string[]>): Index {
  const all = Object.entries(names)
    .map(([name, ids]) => ({ name, key: modKey(name), ids }))
    .filter((e) => e.key.length >= 3);
  return { byKey: new Map(all.map((e) => [e.key, e])), all };
}

// OCR errors allowed in a name: none for short names, then about one per 7 letters.
const allowed = (len: number) => (len < 5 ? 0 : Math.max(1, Math.floor(len * 0.15)));
const MAX_JUNK = 3;

// Closest name; unexplained junk around it counts a little, so "Непрерывность Прайм" is Primed
// Continuity, not Continuity plus junk. Null if nothing is close or two names tie.
export function match(text: string, idx: Index): Entry | null {
  const key = modKey(text);
  if (key.length < 3) return null;
  const exact = idx.byKey.get(key);
  if (exact) return exact;
  let best: Entry | null = null;
  let bestCost = Infinity;
  let tie = false;
  for (const e of idx.all) {
    const max = allowed(e.key.length);
    const junk = key.length - e.key.length;
    if (junk < -max || junk > max + MAX_JUNK) continue;
    const d = levInside(key, e.key);
    if (d > max) continue;
    const cost = d + 0.6 * Math.max(0, junk - d);
    if (cost < bestCost) [best, bestCost, tie] = [e, cost, false];
    else if (cost === bestCost && e !== best) tie = true;
  }
  return tie ? null : best;
}

// A name whose last line is hidden under the card frame (3-line names like "Металлический Бур /
// Аргонака / [Амальгама]"): the text is the beginning of exactly one longer name.
export function matchStart(text: string, idx: Index): Entry | null {
  const key = modKey(text);
  const max = allowed(key.length);
  let best: Entry | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const e of idx.all) {
    if (e.key.length <= key.length || key.length < e.key.length * 0.6) continue;
    const d = levPrefix(key, e.key);
    if (d > max) continue;
    if (d < bestD) [best, bestD, tie] = [e, d, false];
    else if (d === bestD) tie = true;
  }
  return tie ? null : best;
}

// Line b continues line a (the same name wrapped onto the next line).
function below(a: Line, b: Line) {
  const gap = b.y - (a.y + a.h);
  const ca = a.x + a.w / 2, cb = b.x + b.w / 2;
  return b.y > a.y + a.h / 2 && gap < Math.max(a.h, b.h) * 0.8 && Math.abs(ca - cb) < Math.max(a.w, b.w) / 2;
}

// Same place on screen (the same line read by another OCR pass).
function overlaps(a: Line, b: Line) {
  return Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < Math.max(a.w, b.w) / 2 && Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.max(a.h, b.h) / 2;
}

export interface Hit {
  entry: Entry;
  lines: Line[];
}

// Mod names on a frame, and the lines that went into them (plus their copies from other OCR passes).
export function namesIn(lines: Line[], idx: Index): { hits: Hit[]; used: Set<Line> } {
  const used = new Set<Line>();
  const hits: Hit[] = [];
  const take = (group: Line[]) => {
    const text = group.map((l) => l.text).join(" ");
    const m = match(text, idx) ?? (group.length > 1 ? matchStart(text, idx) : null);
    if (!m) return false;
    hits.push({ entry: m, lines: group });
    for (const l of lines) if (group.some((g) => overlaps(g, l))) used.add(l);
    return true;
  };
  const free = (l: Line) => !used.has(l);
  // Longest groups first: "Непрерывность / Прайм" must not be read as plain "Непрерывность".
  for (const a of lines) for (const b of lines) for (const c of lines) {
    if (free(a) && free(b) && free(c) && below(a, b) && below(b, c)) take([a, b, c]);
  }
  for (const a of lines) for (const b of lines) {
    if (free(a) && free(b) && below(a, b)) take([a, b]);
  }
  for (const a of lines) if (free(a)) take([a]);
  return { hits, used };
}
