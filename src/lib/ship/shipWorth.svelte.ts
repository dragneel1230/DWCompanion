// The foundry worked out once for the «Орбитер» head and the foundry tab: what builds, which held blueprints
// are worth starting (grouped by the gear they make), which are not needed, consumables, "almost" ones.
import { loadInvCtx, type InvCtx } from "$lib/inv/ctx";
import { inventory } from "$lib/inventory.svelte";
import { goals } from "$lib/goals/goals.svelte";
import { iconUrl } from "$lib/db";
import type { CraftKind } from "$lib/craft";
import { building, buildables, partParents, worth, USEFUL, type Buildable, type Building, type Worth } from "./foundry";

let ctx = $state<InvCtx | null>(null);
let asked = false;
export function shipCtx(): InvCtx | null {
  if (!asked) {
    asked = true;
    loadInvCtx()
      .then((c) => (ctx = c))
      .catch(() => (asked = false));
  }
  return ctx;
}

export interface Judged {
  b: Buildable;
  w: Worth;
}

// Worth building, by the gear it makes: "Валькирия Прайм — Система ×2 · Каркас".
export interface Group {
  key: string; // craft.json id of the gear (or the item itself)
  name: string;
  icon: string;
  kind: CraftKind;
  goal: boolean;
  items: Judged[];
}

export interface ShipFoundry {
  ctx: InvCtx | null;
  building: Building[];
  groups: Group[];
  skip: Judged[];
  misc: Judged[];
  almost: Judged[];
  useful: number;
}

const EMPTY: ShipFoundry = { ctx: null, building: [], groups: [], skip: [], misc: [], almost: [], useful: 0 };

let parentsOf: { c: InvCtx; m: Map<string, string[]> } | null = null;

export function shipWorth(): ShipFoundry {
  const c = shipCtx();
  const inv = inventory.data;
  if (!c || !inv) return { ...EMPTY, ctx: c };
  if (parentsOf?.c !== c) parentsOf = { c, m: partParents(c) };
  const goalIds = new Set(goals.list.map((g) => g.id));
  const judged = buildables(c, inv).map((b) => ({ b, w: worth(c, inv, b, goalIds, parentsOf!.m) }));
  const ready = judged.filter((x) => !x.b.missing.length);
  const useful = (w: Worth) => USEFUL.includes(w.v);
  const m = new Map<string, Group>();
  for (const x of ready.filter((x) => useful(x.w))) {
    const key = x.w.for ?? x.b.item;
    const ci = c.craft.items[key];
    const g = m.get(key) ?? {
      key,
      name: x.w.forName ?? x.b.name,
      icon: x.w.forIcon ?? (ci ? iconUrl(ci.icon) : x.b.icon),
      kind: ci?.kind ?? x.b.kind,
      goal: false,
      items: [],
    };
    g.goal ||= x.w.v === "goal";
    g.items.push(x);
    m.set(key, g);
  }
  const groups = [...m.values()].sort((a, b) => Number(b.goal) - Number(a.goal) || a.name.localeCompare(b.name));
  return {
    ctx: c,
    building: building(c, inv),
    groups,
    skip: ready.filter((x) => x.w.v === "have" || x.w.v === "enough" || x.w.v === "mastered"),
    misc: ready.filter((x) => x.w.v === "misc"),
    almost: judged.filter((x) => useful(x.w) && x.b.missing.length > 0 && x.b.missing.length <= 2).slice(0, 24),
    useful: groups.length,
  };
}
