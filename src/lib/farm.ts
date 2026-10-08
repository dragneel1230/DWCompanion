// "Где добыть": one index over everything a player farms (resources, warframes, weapons, companions,
// components, prime parts) and short answers to "how do I get it". Data: drops.json, craft.json, db.json.
import { getDb, itemName, normalize, searchList } from "$lib/db";
import { t, num, labels } from "$lib/i18n/index.svelte";
import { rate, type DropsDb, type Src } from "$lib/drops";
import type { CraftDb, CraftItem } from "$lib/craft";

export type FarmKind = "resource" | "frame" | "weapon" | "companion" | "part" | "prime" | "other";

export interface FarmEntry {
  kind: FarmKind;
  id: string; // resources/craft: uniqueName; prime: db item id
  name: string;
  en: string;
  icon: string | null;
  craft: boolean; // built in the foundry
  keys: string[];
}

export const FARM_KINDS: FarmKind[] = ["resource", "frame", "weapon", "companion", "part", "prime", "other"];
export const FARM_KIND = labels<FarmKind>({
  resource: "farm.kind.resource",
  frame: "farm.kind.frame",
  weapon: "farm.kind.weapon",
  companion: "farm.kind.companion",
  part: "farm.kind.part",
  prime: "farm.kind.prime",
  other: "farm.kind.other",
});

// Filter buttons: plural.
export const FARM_KINDS_PL = labels<FarmKind>({
  resource: "farm.kinds.resource",
  frame: "farm.kinds.frame",
  weapon: "farm.kinds.weapon",
  companion: "farm.kinds.companion",
  part: "farm.kinds.part",
  prime: "farm.kinds.prime",
  other: "farm.kinds.other",
});

const CRAFT_TO_FARM: Record<string, FarmKind> = {
  frame: "frame", weapon: "weapon", companion: "companion", part: "part", archwing: "other", mech: "other", gear: "other",
};

// Prime components are relic rewards: the frame's "…HelmetComponent" is built from "…HelmetBlueprint".
export function relicPart(id: string): string | null {
  const items = getDb().items;
  if (items[id]) return id;
  const bp = id.replace(/Component$/, "Blueprint");
  return items[bp] ? bp : null;
}

export function buildIndex(drops: DropsDb, craft: CraftDb): FarmEntry[] {
  const out: FarmEntry[] = [];
  const keys = (ru: string, en: string) => [normalize(ru), normalize(en)];
  for (const [id, r] of Object.entries(drops.resources)) {
    out.push({ kind: "resource", id, name: r.name, en: r.en, icon: r.icon, craft: !!r.craft, keys: keys(r.ru, r.en) });
  }
  for (const [id, c] of Object.entries(craft.items)) {
    if (c.kind === "resource") continue; // the resource's own entry
    if (c.kind === "part" && relicPart(id)) continue; // a prime part: its db item below
    out.push({ kind: CRAFT_TO_FARM[c.kind] ?? "other", id, name: c.name, en: c.en, icon: c.icon, craft: true, keys: keys(c.ru, c.en) });
  }
  const db = getDb();
  for (const [id, it] of Object.entries(db.items)) {
    if (!it.relics.length) continue;
    out.push({ kind: "prime", id, name: itemName(it), en: it.en, icon: it.icon, craft: false, keys: keys(it.ru, it.en) });
  }
  return out;
}

const WEIGHT: Record<FarmKind, number> = { resource: 3, frame: 2.5, weapon: 2, companion: 1.5, prime: 1.2, part: 1, other: 0.5 };
export function findFarm(index: FarmEntry[], query: string, kind: FarmKind | null): FarmEntry[] {
  const list = kind ? index.filter((e) => e.kind === kind) : index;
  return searchList(list, query, (e) => WEIGHT[e.kind] - e.name.length * 0.01);
}

// ---------- texts

const fmt = (n: number) => num(n);

// Sources in the order a player would try them: Market, clan lab, quest, vendor, syndicate; Conclave (PvP) and
// events last — Volt's "Conclave, rank Typhoon" is real but not where a newcomer should go.
const SRC_RANK: Record<Src["k"], number> = { market: 0, lab: 1, quest: 2, vendor: 3, syndicate: 4 };
const late = (s: Src) => (s.k === "vendor" && s.event) || (s.k === "syndicate" && /Conclave|Конклав/.test(s.name));
export function orderSrc(list: Src[] | undefined): Src[] {
  return [...(list ?? [])].sort((a, b) => +late(a) - +late(b) || SRC_RANK[a.k] - SRC_RANK[b.k]);
}

// One source as a short line: "Рынок · 35 000 кр.", "Лаборатория Тэнно", "Квест «Сердце Деймоса»".
export function srcText(s: Src): string {
  switch (s.k) {
    case "market":
      return [t("farm.src.market"), s.cr ? t("ct.cr", { v: fmt(s.cr) }) : "", s.pl ? t("farm.pl", { v: s.pl }) : ""].filter(Boolean).join(" · ");
    case "lab":
      return t("farm.src.lab", { lab: s.lab });
    case "quest":
      return s.name ? t("farm.src.quest", { name: s.name }) : t("farm.src.questAny");
    case "syndicate":
      // Simaris has no ranks: standing only.
      return s.title || s.rank
        ? t("farm.src.syndicate", { name: s.name, title: s.title ? `«${s.title}»` : String(s.rank), v: fmt(s.standing) })
        : t("farm.src.syndicateNoRank", { name: s.name, v: fmt(s.standing) });
    case "vendor": {
      const who = [s.npc, s.place].filter(Boolean).join(", ");
      const head = s.event ? t("farm.src.eventVendor") : who ? t("farm.src.vendorAt", { who }) : t("farm.src.vendor");
      return [head, costText(s)].filter(Boolean).join(" · ");
    }
  }
}

export function costText(s: Extract<Src, { k: "vendor" }>): string {
  const f = (n: number | string) => (typeof n === "number" ? fmt(n) : n); // a range comes as "15–30"
  const parts = s.cost.map(([what, n]) =>
    what === "credits" ? t("ct.cr", { v: f(n) }) : what === "platinum" ? t("farm.pl", { v: n }) : `${f(n)} × ${what}`,
  );
  if (s.syn) parts.push(t("farm.syn", { name: s.syn[0], rank: s.syn[1], v: fmt(s.syn[2]) }));
  return parts.length ? parts.join(", ") : t("farm.priceVaries");
}

// Short "how" for a list row.
export function hintOf(e: FarmEntry, drops: DropsDb, craft: CraftDb): string {
  if (e.kind === "resource") {
    const r = drops.resources[e.id];
    const best = r.endless?.[0];
    if (best) return `${drops.sources[best[0]].name} · ${drops.sources[best[0]].sub?.split(" · ")[0] ?? ""}`;
    // Conclave, events and the like are not where one farms: real sources first.
    const m = r.drops?.find(([i]) => drops.sources[i].kind !== "other") ?? r.drops?.[0];
    if (m) return drops.sources[m[0]].name;
    if (r.farm?.length) return drops.sources[r.farm[0]].name;
    if (r.src?.length) return srcText(orderSrc(r.src)[0]);
    if (r.craft) return t("farm.foundry");
    return r.where ?? "";
  }
  if (e.kind === "prime") {
    const it = getDb().items[e.id];
    const live = it.relics.filter((x) => !getDb().relics[x.relic]?.vaulted).length;
    return live ? t("farm.relicsLive", { n: live }) : t("farm.vaulted");
  }
  return craftHint(craft.items[e.id], drops);
}

export function craftHint(c: CraftItem | undefined, drops: DropsDb): string {
  if (!c) return "";
  const prime = c.bp ? getDb().items[c.bp] : undefined;
  if (prime) {
    const live = prime.relics.filter((x) => !getDb().relics[x.relic]?.vaulted).length;
    return live ? t("farm.relicsLive", { n: live }) : t("farm.vaultedPart");
  }
  if (c.src?.length) return srcText(orderSrc(c.src)[0]);
  const d = c.drops?.find(([i]) => drops.sources[i].kind !== "other") ?? c.drops?.[0];
  if (d) {
    const s = drops.sources[d[0]];
    return s.at ? `${s.sub?.split(" · ")[0]}: ${s.at[0]}` : s.name;
  }
  return "";
}

// Where a mission source is, for the endless list: "Выживание · Заражённые · ур. 25–35".
export const levels = (a: number, b: number) => t("farm.lvl", { a, b });

// Expected pieces per hour, rounded for a hint.
export const perHour = rate;

// Items that use an ingredient, most needed first; a component counts for the items it goes into.
export function usedIn(craft: CraftDb, id: string): [string, number][] {
  const out = new Map<string, number>();
  for (const [cid, c] of Object.entries(craft.items)) {
    const n = c.parts.find(([x]) => x === id)?.[1];
    if (!n) continue;
    const owners = c.kind === "part" ? parentsOf(craft, cid) : [cid];
    for (const o of owners) out.set(o, (out.get(o) ?? 0) + n);
  }
  return [...out].sort((a, b) => b[1] - a[1]);
}

// What a component belongs to.
export function parentsOf(craft: CraftDb, id: string): string[] {
  return Object.entries(craft.items).filter(([, c]) => c.kind !== "part" && c.parts.some(([x]) => x === id)).map(([cid]) => cid);
}

// Resources most needed across all recipes: the start page's quick picks.
export function popular(craft: CraftDb, drops: DropsDb, n = 14): string[] {
  const count = new Map<string, number>();
  for (const c of Object.values(craft.items)) for (const [id] of c.parts) if (drops.resources[id]) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}
