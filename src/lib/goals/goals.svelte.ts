// The player's goals (guide tab): which items, when added, which steps are done. Kept in localStorage
// (`dwc.goals`, shared by the app windows). A step is done by hand, or on its own when the data shows it:
// a relic reward that dropped after the goal was added (EE.log journal), the item in the public profile,
// what the inventory snapshot holds (blueprints, parts, resources, the item itself).
import type { Entry } from "$lib/journal.svelte";
import { inventory } from "$lib/inventory.svelte";
import type { Profile } from "$lib/profile.svelte";
import { xpFor30, type Plan, type Step } from "./plan";

export interface Goal {
  id: string; // craft.json item id
  added: number;
  marks: Record<string, boolean>; // step key -> done (true) / explicitly not done (false, overrides auto)
}

const KEY = "dwc.goals";

function load(): { list: Goal[]; active: string | null } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s?.list) return { list: s.list, active: s.active ?? null };
  } catch {
    // storage unavailable or broken
  }
  return { list: [], active: null };
}

class Goals {
  list = $state<Goal[]>([]);
  active = $state<string | null>(null);

  constructor() {
    this.#read();
    // Other windows (the hub, the main window) change goals too: localStorage is shared, follow it.
    window.addEventListener("storage", (e) => e.key === KEY && this.#read());
  }

  #read() {
    const s = load();
    this.list = s.list;
    this.active = s.active && s.list.some((g) => g.id === s.active) ? s.active : (s.list[0]?.id ?? null);
  }

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ list: this.list, active: this.active }));
    } catch {
      // storage unavailable
    }
  }

  get(id: string | null): Goal | undefined {
    return id ? this.list.find((g) => g.id === id) : undefined;
  }

  add(id: string) {
    if (!this.get(id)) this.list = [{ id, added: Date.now(), marks: {} }, ...this.list];
    this.active = id;
    this.#save();
  }

  open(id: string | null) {
    this.active = id;
    this.#save();
  }

  remove(id: string) {
    this.list = this.list.filter((g) => g.id !== id);
    if (this.active === id) this.active = this.list[0]?.id ?? null;
    this.#save();
  }

  mark(id: string, key: string, done: boolean) {
    const g = this.get(id);
    if (!g) return;
    g.marks = { ...g.marks, [key]: done };
    this.#save();
  }
}

export const goals = new Goals();

// What the data already proves.
export interface Facts {
  journal: Entry[];
  profile: Profile | null;
}

export type Why = "hand" | "journal" | "profile" | "after" | "inventory";

// The inventory holds what this step gives: the blueprint, the built part, enough of the resource.
function inInventory(p: Plan, s: Step): boolean {
  if (!inventory.data) return false;
  const has = (id: string | undefined, n: number) => !!id && (inventory.count(id) ?? 0) >= n;
  switch (s.kind) {
    case "bp":
    case "relic":
      return has(s.bpId, s.count) || has(s.reward, s.count) || (!s.main && has(s.id, s.count));
    case "item":
      return inventory.inArsenal(s.id);
    case "build":
      return s.main ? inventory.inArsenal(p.id) : has(s.id, s.count);
    case "res":
    case "other":
      return has(s.id, s.count);
    default:
      return false;
  }
}

// Done or not, and why (shown as a small tag: the player sees what was marked for them).
export function stepState(g: Goal, p: Plan, s: Step, f: Facts): { done: boolean; why?: Why } {
  const m = g.marks[s.key];
  if (m === false) return { done: false };
  if (m === true) return { done: true, why: "hand" };
  const px = f.profile?.xp[p.id];
  const ix = inventory.xpOf(p.id);
  const xp = Math.max(px ?? -1, ix ?? -1);
  const by: Why = px != null && px >= (ix ?? -1) ? "profile" : "inventory";
  if (s.kind === "rank") return xp >= xpFor30(p) ? { done: true, why: by } : { done: false };
  // Ranked at all (or in the arsenal): it was built, so everything before the rank step is behind.
  if (xp >= 0) return { done: true, why: by };
  if (inventory.inArsenal(p.id)) return { done: true, why: "inventory" };
  if (inInventory(p, s)) return { done: true, why: "inventory" };
  // Built by hand: the steps that lead to it are behind too.
  if (s.kind !== "build" && g.marks[`build:${p.id}`]) return { done: true, why: "after" };
  if (s.kind === "relic" && s.reward) {
    const got = f.journal.filter((e) => e.got === s.reward && e.t >= g.added).length;
    if (got >= s.count) return { done: true, why: "journal" };
  }
  return { done: false };
}

export function progress(g: Goal, p: Plan, f: Facts): { done: number; total: number; next: Step | null } {
  let done = 0;
  let total = 0;
  let next: Step | null = null;
  for (const sec of p.sections)
    for (const s of sec.steps) {
      total++;
      if (stepState(g, p, s, f).done) done++;
      else next ??= s;
    }
  return { done, total, next };
}
