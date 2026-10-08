// Where relics and resources drop (static/data/drops.json, built by scripts/build-drops.mjs from
// DE's official drop tables and ExportSystems). Loaded lazily: only the Resources tab, relic pages
// and search need it.
import { dataUrl, labels, num, t } from "$lib/i18n/index.svelte";

export type SourceKind = "mission" | "bounty" | "enemy" | "other";

export interface Source {
  kind: SourceKind;
  name: string; // "Olympus (Mars)" / "Olympus (Марс)", "Cetus", ...
  sub?: string; // "Disruption · Grineer", "Bounty, lvl 15–25"
  node?: string; // SolNode key for missions
  at?: string[]; // enemies met only in some missions (demolishers): where, "Node (Planet) lvl 5–15"
}

// [source index, [[rotation "A"|"B"|"C"|"", chance %, qty?], ...], score], best first.
// Score: missions — expected pieces per hour (mission length and the A-A-B-C cycle taken into account,
// scripts/build-drops.mjs → perHour); bounties — mean chance × qty over rotations; enemies — chance × qty.
export type Rot = [string, number, number?];
export type Drop = [number, Rot[], number];

export interface Resource {
  en: string;
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  icon: string | null;
  rarity?: string;
  desc?: string;
  where?: string; // "Местонахождение" from the game's description: gathered items, quests, events
  planets?: [string, string][]; // [planet, "common" | "uncommon" | "rare"]
  drops?: Drop[];
  endless?: Endless[]; // our pick of endless missions on the planets that drop it (DE's node data)
  craft?: 1; // also built in the foundry: craft.json has its recipe
  src?: Src[]; // vendors that sell it
  farm?: number[]; // recommended nodes from the wiki (players' advice, not DE data): source indexes
  wiki?: string; // wiki page title
}

// [source index, min enemy level, max enemy level, Dark Sector resource bonus %, rarity on that planet]
export type Endless = [number, number, number, number, "common" | "uncommon" | "rare"];

// How a blueprint (or the thing itself) is obtained besides the drop tables. Names in the file's language.
export type Src =
  | { k: "market"; cr?: number; pl?: number }
  | { k: "lab"; lab: string }
  | { k: "quest"; name: string | null }
  | { k: "syndicate"; name: string; rank: number; title?: string; standing: number; direct?: true }
  | { k: "vendor"; place?: string; npc?: string; event?: true; direct?: true; cost: [string, number | string][]; syn?: [string, number, number] };

// DE's own words for the farming tips (dict of the file's language).
export type Terms = Record<
  | "booster" | "chanceBooster" | "nekros" | "desecrate" | "hydroid" | "pilferingSwarm" | "khora" | "strangledome"
  | "ivara" | "prowl" | "smeeta" | "charm" | "thiefsWit" | "animalInstinct" | "survival" | "excavation" | "steelPath" | "dark",
  string
>;

// Where a mod or arcane comes from: the best drops per kind, vendors and syndicates (build-drops.mjs).
export interface ModSrc {
  drops?: Drop[];
  src?: Src[];
}

export interface DropsDb {
  builtAt: string;
  wikiAt?: string;
  terms: Terms;
  sources: Source[];
  relics: Record<string, Drop[]>;
  resources: Record<string, Resource>;
  mods?: Record<string, ModSrc>; // mod / arcane id
}

let cache: Promise<DropsDb> | null = null;
export function loadDrops(): Promise<DropsDb> {
  cache ??= fetch(dataUrl("drops.json")).then((r) => r.json() as Promise<DropsDb>);
  return cache;
}

export const KIND_TITLE = labels<SourceKind>({
  mission: "drops.kind.mission",
  bounty: "drops.kind.bounty",
  enemy: "drops.kind.enemy",
  other: "drops.kind.other",
});
export const KIND_HINT = labels<SourceKind>({
  mission: "drops.hint.mission",
  bounty: "drops.hint.bounty",
  enemy: "drops.hint.enemy",
  other: "drops.hint.other",
});
export const KIND_ORDER: SourceKind[] = ["mission", "bounty", "enemy", "other"];

export const PLANET_RARITY_RU: Record<string, string> = labels({ common: "drops.often", uncommon: "drops.sometimes", rare: "drops.rarely" });

// 14.29 -> "14,29 %", 0.0712 -> "0,07 %"
export function pct(n: number): string {
  const v = n.toFixed(n >= 10 ? 1 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return t("unit.pct", { v: num(+v) });
}

// Expected pieces per hour: "≈ 12/ч", "≈ 0,4/ч", "≈ 1 200/ч".
export function rate(n: number): string {
  const v = n >= 10 ? num(Math.round(n)) : num(+n.toFixed(n >= 1 ? 1 : 2));
  return t("unit.perHour", { v });
}

// Drops split by kind, each list best first.
export function byKind(db: DropsDb, drops: Drop[] | undefined) {
  const out: { kind: SourceKind; rows: { src: Source; rots: Rot[]; score: number }[] }[] = [];
  for (const kind of KIND_ORDER) {
    const rows = (drops ?? [])
      .map(([i, rots, score]) => ({ src: db.sources[i], rots, score }))
      .filter((r) => r.src.kind === kind);
    if (rows.length) out.push({ kind, rows });
  }
  return out;
}

export const wikiUrl = (title: string) => `https://wiki.warframe.com/w/${encodeURIComponent(title.replace(/ /g, "_"))}`;
