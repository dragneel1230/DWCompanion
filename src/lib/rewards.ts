// Matches OCR text of relic reward cards to relic reward items.
// Names on screen are the item's Russian name, with "Чертёж: " in front of blueprints.
// Candidates: rewards of the squad's relics (from EE.log) first, then every relic reward.
import { getDb, type Item } from "$lib/db";

export interface Candidate {
  id: string;
  item: Item;
  name: string; // as shown on the reward screen
  key: string; // compact form for comparison
}

export interface Match {
  cand: Candidate;
  score: number; // 0..1
}

// Lowercase, ё→е, letters and digits only: OCR mixes up ":" "." and spaces.
const compact = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");

export const screenName = (it: Item) => (it.bp ? `Чертёж: ${it.ru}` : it.ru);

function cand(id: string): Candidate | null {
  const item = getDb().items[id];
  if (!item) return null;
  const name = screenName(item);
  return { id, item, name, key: compact(name) };
}

let all: Candidate[] | null = null;
export function allRewards(): Candidate[] {
  if (!all) {
    const ids = new Set<string>();
    for (const r of Object.values(getDb().relics)) for (const rw of r.rewards) ids.add(rw.id);
    all = [...ids].map(cand).filter((c): c is Candidate => !!c);
  }
  return all;
}

// "T1VoidProjectionProteaPrimeAPlatinum" -> relic key ("Lith P9").
export function relicKey(projection: string): string | undefined {
  return getDb().projections[projection.replace(/(Bronze|Silver|Gold|Platinum)$/, "")];
}

export function squadRewards(projections: string[]): Candidate[] {
  const db = getDb();
  const ids = new Set<string>();
  for (const p of projections) {
    const r = db.relics[relicKey(p) ?? ""];
    r?.rewards.forEach((rw) => ids.add(rw.id));
  }
  return [...ids].map(cand).filter((c): c is Candidate => !!c);
}

function lev(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Words of a name for comparison (short OCR junk like "им" is dropped).
const words = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3);

const wordSim = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

// How well a candidate explains the OCR words of all variants (the two OCR passes often each get
// a different half of a two-line name right): F1 of fuzzy word matches both ways.
function wordScore(ocrWords: string[], candWords: string[]): number {
  if (!ocrWords.length || !candWords.length) return 0;
  const best = (w: string, pool: string[]) => Math.max(...pool.map((p) => wordSim(w, p)));
  const recall = candWords.reduce((s, w) => s + best(w, ocrWords), 0) / candWords.length;
  const precision = ocrWords.reduce((s, w) => s + best(w, candWords), 0) / ocrWords.length;
  return (2 * recall * precision) / (recall + precision || 1);
}

// Whole-string similarity of one OCR variant, for names OCR split oddly into words.
function charScore(ocr: string, key: string): number {
  if (!ocr) return 0;
  return 1 - lev(ocr, key) / Math.max(ocr.length, key.length);
}

export function bestMatch(texts: string[], pool: Candidate[]): Match | null {
  const ocrWords = [...new Set(texts.flatMap(words))];
  const keys = texts.map(compact);
  let best: Match | null = null;
  for (const c of pool) {
    const cw = words(c.name);
    const score = Math.max(wordScore(ocrWords, cw), 0.95 * Math.max(...keys.map((k) => charScore(k, c.key))));
    if (!best || score > best.score) best = { cand: c, score };
  }
  return best;
}

// The squad's relics narrow the choice, but one can be missing from the log (its model was already
// loaded), so they win only when not clearly worse than the whole reward list.
export function matchCard(texts: string[], squad: Candidate[]): Match | null {
  const a = bestMatch(texts, allRewards());
  const s = squad.length ? bestMatch(texts, squad) : null;
  if (s && (!a || s.score >= a.score - 0.08)) return s;
  return a;
}
