// «Литейная»: what is building now (inventory PendingRecipes) and which blueprints the player holds can
// be started right away or miss little. Ingredients and times — craft.json (DE's ExportRecipes).
import { iconUrl } from "$lib/db";
import { describe, type InvCtx } from "$lib/inv/ctx";
import type { CraftKind } from "$lib/craft";
import type { InvData } from "$lib/inventory.svelte";

export interface Building {
  oid: string;
  recipe: string;
  item: string | null; // what it builds (craft.json key), null when unknown
  name: string;
  icon: string;
  done: number;
  start: number; // done − build time; = done when the time is unknown
}

export interface Missing {
  id: string;
  name: string;
  need: number;
  have: number;
}

export interface Buildable {
  recipe: string;
  item: string;
  kind: CraftKind;
  name: string;
  icon: string;
  copies: number; // blueprints of it held
  credits: number;
  time: number; // seconds
  missing: Missing[]; // empty: can start now
}

export function building(c: InvCtx, inv: InvData): Building[] {
  return (inv.foundry ?? [])
    .map((f) => {
      const item = c.bpOf.get(f.id) ?? null;
      const ci = item ? c.craft.items[item] : undefined;
      const bn = c.craft.bpNames?.[f.id];
      const d = ci ? { name: ci.name, icon: iconUrl(ci.icon) } : bn ? { name: bn[0], icon: iconUrl(bn[1]) } : describe(c, f.id);
      return { oid: f.oid, recipe: f.id, item, name: d.name, icon: d.icon, done: f.done, start: f.done - (ci?.time ?? bn?.[2] ?? 0) * 1000 };
    })
    .sort((a, b) => a.done - b.done);
}

// Blueprints held -> what is missing for each. Ingredients are counted stacks or arsenal items (a weapon
// that goes into another one); credits count as an ingredient too. Sorted: ready first, then by how little
// is missing.
export function buildables(c: InvCtx, inv: InvData): Buildable[] {
  const arsenal = new Set(inv.arsenal);
  const have = (id: string) => (inv.items[id] ?? 0) + (arsenal.has(id) ? 1 : 0);
  const out: Buildable[] = [];
  for (const [recipe, copies] of Object.entries(inv.items)) {
    if (copies <= 0) continue;
    const item = c.bpOf.get(recipe);
    const ci = item ? c.craft.items[item] : undefined;
    if (!item || !ci) continue;
    const missing: Missing[] = [];
    for (const [id, need] of ci.parts) {
      const h = have(id);
      if (h < need) missing.push({ id, name: describe(c, id).name, need, have: h });
    }
    if (ci.credits > inv.credits) missing.push({ id: "credits", name: "", need: ci.credits, have: inv.credits });
    out.push({ recipe, item, kind: ci.kind, name: ci.name, icon: iconUrl(ci.icon), copies, credits: ci.credits, time: ci.time, missing });
  }
  // How far from ready: share of the ingredients still to get.
  const gap = (b: Buildable) => b.missing.reduce((s, m) => s + (m.need - m.have) / m.need, 0);
  return out.sort((a, b) => gap(a) - gap(b) || a.name.localeCompare(b.name));
}


// ---------- Is it worth building

// goal: a goal (or its part); new: gear not in the arsenal and never ranked (mastery); part: for such gear;
// have: the gear it makes / goes into is in the arsenal; enough: that many already built; mastered: ranked once
// and sold; misc: consumables, resources, keys.
export type Verdict = "goal" | "new" | "part" | "have" | "enough" | "mastered" | "misc";
export const USEFUL: Verdict[] = ["goal", "new", "part"];

export interface Worth {
  v: Verdict;
  for?: string; // the gear a part goes into
  forName?: string;
  forIcon?: string;
}

const GEAR_KINDS = new Set(["frame", "weapon", "companion", "archwing", "mech"]);

// Craftable gear each part goes into.
export function partParents(c: InvCtx): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, ci] of Object.entries(c.craft.items)) {
    if (!GEAR_KINDS.has(ci.kind)) continue;
    for (const [pid] of ci.parts) if (c.craft.items[pid]) out.set(pid, [...(out.get(pid) ?? []), id]);
  }
  return out;
}

export function worth(c: InvCtx, inv: InvData, b: Buildable, goalIds: Set<string>, parents: Map<string, string[]>): Worth {
  const arsenal = new Set(inv.arsenal);
  const ranked = (id: string) => (inv.xp[id] ?? 0) > 0;
  const ps = parents.get(b.item) ?? [];
  // A shared ingredient (Forma, Orokin Cell parts…) belongs to no one piece of gear.
  if (ps.length > 3) return { v: "misc" };
  if (GEAR_KINDS.has(b.kind)) {
    if (goalIds.has(b.item)) return { v: "goal" };
    if (arsenal.has(b.item)) return { v: "have" };
    return { v: ranked(b.item) ? "mastered" : "new" };
  }
  if (b.kind !== "part") return { v: "misc" };
  const info = (p: string): Worth => ({ v: "part", for: p, forName: c.craft.items[p].name, forIcon: iconUrl(c.craft.items[p].icon) });
  const goal = ps.find((p) => goalIds.has(p));
  if (goal) return { ...info(goal), v: "goal" };
  const open = ps.filter((p) => !arsenal.has(p));
  if (!open.length) return ps[0] ? { ...info(ps[0]), v: "have" } : { v: "misc" };
  const p = open.find((x) => !ranked(x)) ?? open[0];
  const need = c.craft.items[p].parts.find(([id]) => id === b.item)?.[1] ?? 1;
  if ((inv.items[b.item] ?? 0) >= need) return { ...info(p), v: "enough" };
  return { ...info(p), v: ranked(p) ? "mastered" : "part" };
}

// "Valkyr Prime Systems" under "Valkyr Prime": the part's own word.
export function partShort(name: string, parent: string | undefined): string {
  if (!parent || !name.startsWith(parent)) return name;
  return name.slice(parent.length).replace(/^[\s:·—-]+/, "") || name;
}
