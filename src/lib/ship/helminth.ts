// «Гельминт»: rank, secretions, what is subsumed and what can be, this week's Invigorations.
// Inventory InfestedFoundry + frames.json `infest` (DE's subsume recipes).
// Rank thresholds — wiki (Helminth, Metamorphosis): rank r needs 1125·r(r+3)/2 affinity in all, known up to 10;
// the inventory keeps 100 × the affinity the game shows (rank 9 of a real account: 7 173 259).
import { iconUrl } from "$lib/db";
import { abilityById, type FramesDb } from "$lib/frames";
import type { InvData, InvHelminth } from "$lib/inventory.svelte";

export const MAX_RANK = 10;
const total = (r: number) => (1125 * r * (r + 3)) / 2;

export function rankOf(xpRaw: number): { rank: number; xp: number; from: number; to: number | null } {
  const xp = Math.floor(xpRaw / 100);
  let rank = 0;
  while (rank < MAX_RANK && xp >= total(rank + 1)) rank++;
  return { rank, xp, from: total(rank), to: rank < MAX_RANK ? total(rank + 1) : null };
}

// Secretion order as the game shows them.
export const SECRETIONS = ["Bile", "Pheromones", "Calx", "Biotics", "Synthetics", "Oxides"].map((s) => `/Lotus/Types/Items/InfestedFoundry/Helminth${s}`);
export const pct = (v: number) => Math.round(v) / 10; // tenths of a percent -> percent

export interface Cost {
  id: string;
  need: number;
  have: number;
}
const costs = (list: [string, number][], h: InvHelminth): Cost[] => list.map(([id, need]) => ({ id, need, have: h.res[id] ?? 0 }));
export const enough = (c: Cost[]) => c.every((x) => x.have >= x.need);

export interface HelminthFrame {
  frame: string;
  name: string;
  icon: string;
  ability: { id: string; name: string; icon: string; note: string }; // note: how the subsumed version differs
  cost: Cost[]; // subsume
  inject: Cost[]; // each injection
  time: number;
  fed: boolean;
  owned: boolean; // this warframe (not its Prime) in the arsenal
  prime: boolean; // its Prime in the arsenal: subsuming the base one loses nothing
}

export function helminthFrames(db: FramesDb, inv: InvData, h: InvHelminth): HelminthFrame[] {
  const inf = db.infest;
  if (!inf) return [];
  const fed = new Set(h.fed);
  const arsenal = new Set(inv.arsenal);
  const primeBases = new Set(inv.arsenal.filter((id) => db.frames[id]?.prime).map((id) => inf.base[id]));
  const out: HelminthFrame[] = [];
  for (const [frame, s] of Object.entries(inf.subsume)) {
    const f = db.frames[frame];
    const a = abilityById(db, s.ab);
    if (!f || !a) continue;
    out.push({
      frame,
      name: f.name,
      icon: iconUrl(f.icon),
      ability: { id: s.ab, name: a.name, icon: iconUrl(a.icon), note: a.helm?.note ?? "" },
      cost: costs(s.cost, h),
      inject: costs(s.inject, h),
      time: s.time,
      fed: fed.has(frame),
      owned: arsenal.has(frame),
      prime: primeBases.has(inf.base[frame]),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// This week's Invigoration warframes: base suit -> the warframes of that base the player has (Prime first).
export interface Offer {
  base: string;
  name: string;
  icon: string;
  mine: { id: string; name: string; invig?: [string, string, number] }[];
}
export function offers(db: FramesDb, inv: InvData, h: InvHelminth): Offer[] {
  const inf = db.infest;
  if (!inf) return [];
  return h.offers.map((base) => {
    const all = Object.keys(db.frames).filter((id) => inf.base[id] === base);
    const plain = all.find((id) => !db.frames[id].prime) ?? all[0];
    const mine = all
      .filter((id) => inv.arsenal.includes(id))
      .sort((a, b) => Number(db.frames[b].prime) - Number(db.frames[a].prime))
      .map((id) => ({ id, name: db.frames[id].name, invig: h.invig[id] }));
    const f = plain ? db.frames[plain] : undefined;
    return { base, name: f?.name ?? base.split("/").pop()!.replace(/BaseSuit$/, ""), icon: iconUrl(f?.icon ?? null), mine };
  });
}

// Invigorations (and the weekly reset) turn over on Monday 00:00 UTC.
export function nextMonday(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7);
}
