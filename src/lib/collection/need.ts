// "Collection" priority of the reward overlay and the hub's "Сейчас": which relic rewards are parts the
// player is missing. Two modes (overlay settings):
//   sell — sets to complete and sell whole: a part counts when it's missing for the next copy of its set
//          (tradeable blueprints / parts, the same rule as the inventory tab's sets, inv/worth.ts);
//          needs the inventory snapshot.
//   mr   — sets for mastery: only sets whose item isn't mastered and isn't in the arsenal; parts already
//          held (blueprint, part or built component) don't count. Without the inventory every part of such
//          a set counts (the public profile knows mastery, not parts).
// Score: what the set is worth (platinum of the set / mastery it gives) times how complete it would be.
import { getDb, setParts } from "$lib/db";
import { bulkSell, loadBulk } from "$lib/api";
import type { InvData } from "$lib/inventory.svelte";
import { guess, loadMastery, perRank, rankOf, type MasteryDb } from "$lib/mastery";

export type CollMode = "sell" | "mr";

export interface CollNeed {
  set: string; // set id
  name: string; // set name, interface language
  have: number; // parts toward the next set before this one; -1 = unknown (no inventory)
  total: number;
  score: number;
}

export interface CollCtx {
  inv: InvData | null;
  xp: Record<string, number>; // profile affinity
  skip: { cats: string[]; ids: string[] }; // put aside in the collection tab
  mastery: MasteryDb;
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

// Fresh from localStorage (shared with the main window): the overlay reads it when a reward screen shows.
export async function loadCollCtx(): Promise<CollCtx> {
  const [mastery] = await Promise.all([loadMastery(), loadBulk().catch(() => {})]);
  const skip = readJson<{ cats?: string[]; ids?: string[] }>("dwc.coll.skip");
  return {
    inv: readJson<InvData>("dwc.inventory"),
    xp: readJson<{ xp?: Record<string, number> }>("dwc.profile")?.xp ?? {},
    skip: { cats: skip?.cats ?? [], ids: skip?.ids ?? [] },
    mastery,
  };
}

// Whether there is anything to go on in this mode.
export const collKnown = (mode: CollMode, c: CollCtx) => !!c.inv || (mode === "mr" && Object.keys(c.xp).length > 0);

const tradeable = (inv: InvData, id: string) => inv.items[id] ?? 0;
// A warframe / companion part also counts as its built component for mastery ("…HelmetBlueprint" -> "…HelmetComponent").
const held = (inv: InvData, id: string) => tradeable(inv, id) + (id.endsWith("Blueprint") ? (inv.items[id.replace(/Blueprint$/, "Component")] ?? 0) : 0);

function mastered(id: string, c: CollCtx): boolean {
  const m = c.mastery.items[id] ?? guess(id);
  const xp = Math.max(c.xp[id] ?? 0, c.inv?.xp[id] ?? 0);
  return rankOf(xp, m.fl, m.max) >= m.max;
}

export function collNeed(id: string, mode: CollMode, c: CollCtx): CollNeed | null {
  const db = getDb();
  const sid = db.items[id]?.set;
  const set = sid ? db.sets[sid] : undefined;
  if (!sid || !set || !collKnown(mode, c)) return null;
  const parts = setParts(set);
  const total = parts.reduce((n, x) => n + x.count, 0);
  const inv = c.inv;

  if (mode === "sell") {
    if (!inv) return null;
    const full = Math.min(...parts.map((x) => Math.floor(tradeable(inv, x.id) / x.count)));
    const left = (pid: string, n: number) => Math.max(0, tradeable(inv, pid) - full * n);
    const me = parts.find((x) => x.id === id)!;
    if (left(id, me.count) >= me.count) return null; // enough of this one for the next set
    const have = parts.reduce((n, x) => n + Math.min(x.count, left(x.id, x.count)), 0);
    const price = bulkSell(set.slug) ?? 1;
    return { set: sid, name: set.name, have, total, score: (price * (have + 1)) / total };
  }

  const m = c.mastery.items[sid] ?? guess(sid);
  if (c.skip.ids.includes(sid) || c.skip.cats.includes(m.cat)) return null;
  if (mastered(sid, c) || inv?.arsenal.includes(sid)) return null;
  let have = -1;
  if (inv) {
    const me = parts.find((x) => x.id === id)!;
    if (held(inv, id) >= me.count) return null;
    have = parts.reduce((n, x) => n + Math.min(x.count, held(inv, x.id)), 0);
  }
  const gives = m.max * perRank(m.fl);
  return { set: sid, name: set.name, have, total, score: (gives * (Math.max(0, have) + 1)) / total };
}
