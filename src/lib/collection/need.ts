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

// What the reward overlay says about any part, whatever the priority: its set, how much of it is collected
// (complete copies and the parts toward the next one), this part held and needed per set, the item's state.
export interface PartInfo {
  set: string; // set id (the item's uniqueName)
  name: string; // set name, interface language
  per: number; // this part per set (two blades…)
  have: number; // this part held (blueprint, part or built component); -1 = unknown (no inventory)
  next: number; // parts toward the next copy of the set, this one not counted; -1 = unknown
  total: number; // parts in a set
  full: number; // complete copies held
  mastered: boolean | null; // null: neither profile nor inventory
  owned: boolean | null; // in the arsenal; null without the inventory
  // Every part of the set: blueprints / parts held, components already built from them, how many a set takes.
  parts: { id: string; name: string; per: number; bp: number; built: number }[];
}
export function partInfo(id: string, c: CollCtx | null): PartInfo | null {
  const db = getDb();
  const sid = db.items[id]?.set;
  const set = sid ? db.sets[sid] : undefined;
  if (!sid || !set) return null;
  const parts = setParts(set);
  const total = parts.reduce((n, x) => n + x.count, 0);
  const per = parts.find((x) => x.id === id)?.count ?? 1;
  const inv = c?.inv ?? null;
  const known = !!c && (!!inv || Object.keys(c.xp).length > 0);
  let have = -1;
  let next = -1;
  let full = 0;
  if (inv) {
    have = held(inv, id);
    full = Math.min(...parts.map((x) => Math.floor(held(inv, x.id) / x.count)));
    next = parts.reduce((n, x) => n + Math.min(x.count, held(inv, x.id) - full * x.count), 0);
  }
  return {
    set: sid,
    name: set.name,
    per,
    have,
    next,
    total,
    full,
    mastered: known ? mastered(sid, c!) : null,
    owned: inv ? inv.arsenal.includes(sid) : null,
    parts: parts.map((x) => {
      const it = db.items[x.id];
      const built = inv && x.id.endsWith("Blueprint") ? (inv.items[x.id.replace(/Blueprint$/, "Component")] ?? 0) : 0;
      // "Лекс Прайм: Ствол" -> "Ствол"; the main blueprint has no part name.
      const name = it?.name.includes(": ") ? it.name.split(": ").pop()! : "";
      return { id: x.id, name, per: x.count, bp: inv ? tradeable(inv, x.id) : -1, built };
    }),
  };
}
