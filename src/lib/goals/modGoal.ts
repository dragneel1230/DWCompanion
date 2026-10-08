// A mod as a goal: two steps, get it and rank it up. Done by hand, or on its own from the inventory
// snapshot (the mod is there / its best copy is at max rank) and the manual "I have it" marks.
import type { Mod, ModRarity } from "$lib/frames";
import { inventory } from "$lib/inventory.svelte";
import { owned } from "$lib/owned.svelte";
import type { Goal, Why } from "./goals.svelte";

export type ModStep = "get" | "rank";
export const MOD_STEPS: ModStep[] = ["get", "rank"];
export const modKey = (id: string, s: ModStep) => `${s}:${id}`;

// Endo to rank a mod from 0: base × (2^rank − 1), base by rarity (WARFRAME wiki, "Fusion").
const ENDO_BASE: Partial<Record<ModRarity, number>> = { Common: 10, Uncommon: 20, Rare: 30, Legendary: 40 };
export function endoToMax(m: Mod): number | null {
  const b = ENDO_BASE[m.rarity];
  return b && m.max ? b * (2 ** m.max - 1) : null;
}

export function modStepState(g: Goal, id: string, m: Mod, s: ModStep): { done: boolean; why?: Why } {
  const mark = g.marks[modKey(id, s)];
  if (mark === false) return { done: false };
  if (mark === true) return { done: true, why: "hand" };
  const rank = inventory.modRank(id);
  if (rank != null && rank >= m.max) return { done: true, why: "inventory" };
  if (s === "rank") return { done: false };
  if (inventory.hasMod(id)) return { done: true, why: "inventory" };
  if (owned.has(id)) return { done: true, why: "hand" };
  if (g.marks[modKey(id, "rank")]) return { done: true, why: "after" };
  return { done: false };
}

export function modProgress(g: Goal, id: string, m: Mod): { done: number; total: number; next: ModStep | null } {
  let done = 0;
  let next: ModStep | null = null;
  for (const s of MOD_STEPS) {
    if (modStepState(g, id, m, s).done) done++;
    else next ??= s;
  }
  return { done, total: MOD_STEPS.length, next };
}
