// Crafting: what a warframe / weapon / companion / gear takes, from DE's ExportRecipes
// (static/data/craft.json, built by scripts/build-drops.mjs). Loaded lazily.
import type { Drop, DropsDb, Src } from "$lib/drops";
import { rate } from "$lib/drops";
import { dataUrl, labels, num, t } from "$lib/i18n/index.svelte";

export type CraftKind = "frame" | "weapon" | "companion" | "archwing" | "mech" | "gear" | "part" | "resource";

export interface CraftItem {
  en: string;
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  icon: string | null;
  kind: CraftKind;
  credits: number;
  time: number; // seconds in the foundry
  num: number; // pieces per build
  parts: [string, number][]; // [ingredient id, count]
  drops?: Drop[]; // where its blueprint drops (DE drop tables); prime parts come from relics instead
  src?: Src[];
  bp?: string; // prime items: the blueprint id (a relic reward in db.json) // market, clan research, quest, vendors (scripts/build-drops.mjs → sourcesOf)
  r?: string; // other items: the blueprint id (the inventory lists blueprints by it)
}

export interface CraftDb {
  items: Record<string, CraftItem>;
  names: Record<string, { ru: string; en: string; name: string; icon: string | null }>; // other ingredients
  bpNames?: Record<string, [string, string | null, number]>; // blueprints of things outside the tree: recipe id -> result name, icon, build time (s)
}

let cache: Promise<CraftDb> | null = null;
export function loadCraft(): Promise<CraftDb> {
  cache ??= fetch(dataUrl("craft.json")).then((r) => r.json() as Promise<CraftDb>);
  return cache;
}

export const CRAFT_KIND_RU = labels<CraftKind>({
  frame: "craft.kind.frame",
  weapon: "craft.kind.weapon",
  companion: "craft.kind.companion",
  archwing: "craft.kind.archwing",
  mech: "craft.kind.mech",
  gear: "craft.kind.gear",
  part: "craft.kind.part",
  resource: "craft.kind.resource",
});

export interface Total {
  credits: number;
  time: number; // longest chain: parts are built in parallel, then the item
  resources: [string, number][]; // most needed first
  other: [string, number][]; // ingredients that are neither resources nor craftable (fish parts, tokens…)
  parts: { id: string; count: number }[]; // first-level craftable ingredients
}

// Everything the item takes, components expanded down to resources.
export function totals(db: CraftDb, drops: DropsDb, id: string): Total {
  const res = new Map<string, number>();
  const other = new Map<string, number>();
  let credits = 0;
  function walk(cid: string, need: number, depth: number): number {
    const c = db.items[cid];
    const runs = Math.ceil(need / (c.num || 1));
    credits += runs * c.credits;
    let longest = 0;
    for (const [ing, n] of c.parts) {
      const count = n * runs;
      if (drops.resources[ing] || depth > 5) res.set(ing, (res.get(ing) ?? 0) + count);
      else if (db.items[ing]) longest = Math.max(longest, walk(ing, count, depth + 1));
      else other.set(ing, (other.get(ing) ?? 0) + count);
    }
    return longest + c.time;
  }
  const time = db.items[id] ? walk(id, 1, 0) : 0;
  const parts = (db.items[id]?.parts ?? []).filter(([p]) => db.items[p] && !drops.resources[p]).map(([p, count]) => ({ id: p, count }));
  const byCount = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return { credits, time, resources: byCount(res), other: byCount(other), parts };
}

// Short "where to get it" for a resource: best mission by pieces per hour, else planets, else the game's text.
// Planet resources drop mostly from enemies and containers, which the tables don't rank: for them the
// wiki's first recommended nodes instead of the top mission reward.
export function whereShort(drops: DropsDb, id: string): string {
  const r = drops.resources[id];
  if (!r) return "";
  const e = r.endless?.[0];
  if (e) return `${drops.sources[e[0]].name} · ${drops.sources[e[0]].sub?.split(" · ")[0] ?? ""}${e[3] ? ` +${e[3]}%` : ""}`;
  const best = r.planets ? null : r.drops?.find(([i]) => drops.sources[i].kind === "mission");
  const planets = r.planets?.map((p) => p[0]);
  const parts: string[] = [];
  if (planets?.length) parts.push(planets.slice(0, 4).join(", ") + (planets.length > 4 ? "…" : ""));
  if (r.farm?.length) parts.push(t("ct.wikiFarm", { v: r.farm.slice(0, 2).map((i) => drops.sources[i].name).join(", ") }));
  if (best) parts.push(`${drops.sources[best[0]].name} ${rate(best[2])}`);
  if (!parts.length) {
    const any = r.drops?.[0];
    if (any) parts.push(drops.sources[any[0]].name);
    else if (r.where) parts.push(r.where);
  }
  return parts.join(" · ");
}

// 259200 -> "3 д", 43200 -> "12 ч", 60 -> "1 мин"
export function buildTime(s: number): string {
  if (s >= 86400) return t("unit.days", { v: num(s / 86400, 1) });
  if (s >= 3600) return t("unit.hours", { v: num(s / 3600, 1) });
  return t("unit.minutes", { v: Math.max(1, Math.round(s / 60)) });
}
