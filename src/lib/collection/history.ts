// Profile snapshots: what changed since the previous profile read (items mastered / leveled, mastery
// gained) and the mastery total over time for a small chart. localStorage `dwc.profile.history`,
// shared by the app and the hub (both record the same profile; a snapshot is keyed by its read time).
import type { Row } from "$lib/mastery";

interface Snap {
  at: number;
  total: number;
  mr: number;
  ranks: Record<string, number>;
}

export interface Change {
  at: number; // read that brought the change
  since: number; // previous read
  xp: number;
  mr: [number, number];
  mastered: string[];
  leveled: [string, number, number][]; // id, from, to (not yet maxed)
  started: string[]; // first ranks on an item
}

export interface History {
  last: Snap | null;
  change: Change | null;
  points: { at: number; total: number; mr: number }[];
}

const KEY = "dwc.profile.history";
const MAX_POINTS = 400;

export function readHistory(): History {
  try {
    const h = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (h) return h;
  } catch {
    // storage unavailable
  }
  return { last: null, change: null, points: [] };
}

// Records the summarized profile; returns the updated history. A read with nothing new keeps the last change.
export function record(at: number, total: number, mr: number, rows: Row[], maxOf: (id: string) => number): History {
  const h = readHistory();
  if (h.last && h.last.at >= at) return h;
  const ranks: Record<string, number> = {};
  for (const r of rows) if (r.rank > 0) ranks[r.id] = r.rank;
  const snap: Snap = { at, total, mr, ranks };
  if (h.last) {
    const prev = h.last.ranks;
    const mastered: string[] = [];
    const leveled: [string, number, number][] = [];
    const started: string[] = [];
    for (const [id, rank] of Object.entries(ranks)) {
      const was = prev[id] ?? 0;
      if (rank <= was) continue;
      if (rank >= maxOf(id)) mastered.push(id);
      else if (!was) started.push(id);
      else leveled.push([id, was, rank]);
    }
    const xp = total - h.last.total;
    if (xp > 0 || mastered.length || leveled.length || started.length || mr !== h.last.mr) {
      h.change = { at, since: h.last.at, xp, mr: [h.last.mr, mr], mastered, leveled, started };
    }
  }
  if (!h.points.length || h.points.at(-1)!.total !== total || h.points.at(-1)!.mr !== mr) {
    h.points = [...h.points, { at, total, mr }].slice(-MAX_POINTS);
  }
  h.last = snap;
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // storage unavailable
  }
  return h;
}
