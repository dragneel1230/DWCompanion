// Mastery math (wiki "Mastery Rank"): an item's rank from its affinity, the mastery XP it gives,
// star chart and intrinsics mastery, MR thresholds. Item list: static/data/mastery.json.
import type { Profile } from "$lib/profile.svelte";
import type { CraftDb } from "$lib/craft";
import type { InvFoundry } from "$lib/inventory.svelte";
import { dataUrl, labels, t } from "$lib/i18n/index.svelte";

export const FOUNDERS = new Set(["/Lotus/Powersuits/Excalibur/ExcaliburPrime","/Lotus/Weapons/Tenno/Pistol/LatoPrime","/Lotus/Weapons/Tenno/Melee/LongSword/SkanaPrime"]);

export type MasteryCat =
  | "warframe" | "primary" | "secondary" | "melee" | "companion" | "companionweapon"
  | "archwing" | "archweapon" | "necramech" | "amp" | "kdrive" | "zaw" | "kitgun" | "modularcompanion" | "other";

export interface MItem {
  ru: string; // Russian name: recognition of the Russian client, search, whispers to RU players
  name: string;
  en: string;
  icon: string | null;
  cat: MasteryCat;
  fl?: boolean; // frame-like: 200 mastery per rank, 1000 x rank^2 affinity
  max: number; // 30 or 40
  mr?: number;
  prime?: boolean;
  mod?: "prism" | "strike" | "chamber" | "board" | "model" | "breed"; // modular: the part that carries the rank
}

export interface MasteryDb {
  builtAt: string;
  items: Record<string, MItem>;
  // Planet (DE's systemIndex), name and mission type: absent in files built before v0.2.7.
  nodes: Record<string, { xp: number; j?: 1; p?: number; n?: string; m?: string }>;
  chartNodes?: Record<string, { xp: number; j?: 1; p?: number; n?: string; m?: string; sp?: boolean; unknownXp?: boolean }>;
  systems?: Record<string, string>; // systemIndex -> planet name
  quests?: Quest[];
}

// A quest (DE's key chain). Order and `after` (the quest that opens it) are the wiki's; `g`: main story, a branch
// of it, or a side / warframe quest. Rewards: the next quest (`q`) or a named item (`bp`: its blueprint).
export interface Quest {
  id: string;
  name: string;
  d?: string;
  icon: string | null;
  st: number;
  g: "main" | "branch" | "side";
  after?: string;
  rw?: ({ q: string } | { name: string; bp?: 1 })[];
}

// Two-in-one warframes: the secondary half (Orion) levels together with the pair but gives no mastery
// (wiki "Sirius & Orion/Abilities"). Its affinity counts for the pair, its own id maps to the pair's.
export const PAIR_OF: Record<string, string> = { "/Lotus/Powersuits/SiriusOrion/OrionSuit": "/Lotus/Powersuits/SiriusOrion/SiriusSuit" };
export function foldPairs(xp: Record<string, number>): Record<string, number> {
  for (const [half, main] of Object.entries(PAIR_OF)) if (xp[half] != null) xp[main] = Math.max(xp[main] ?? 0, xp[half]);
  return xp;
}

let cache: Promise<MasteryDb> | null = null;
export function loadMastery(): Promise<MasteryDb> {
  cache ??= fetch(dataUrl("mastery.json")).then((r) => r.json() as Promise<MasteryDb>);
  return cache;
}

export const CAT_RU = labels<MasteryCat>({
  warframe: "mastery.cat.warframe",
  primary: "mastery.cat.primary",
  secondary: "mastery.cat.secondary",
  melee: "mastery.cat.melee",
  companion: "mastery.cat.companion",
  companionweapon: "mastery.cat.companionweapon",
  archwing: "mastery.cat.archwing",
  archweapon: "mastery.cat.archweapon",
  necramech: "mastery.cat.necramech",
  amp: "mastery.cat.amp",
  kdrive: "mastery.cat.kdrive",
  zaw: "mastery.cat.zaw",
  kitgun: "mastery.cat.kitgun",
  modularcompanion: "mastery.cat.modularcompanion",
  other: "mastery.cat.other",
});
export const CAT_ORDER: MasteryCat[] = [
  "warframe", "primary", "secondary", "melee", "companion", "companionweapon", "archwing", "archweapon", "necramech",
  "amp", "kdrive", "zaw", "kitgun", "modularcompanion",
];

export const rankOf = (xp: number, fl: boolean | undefined, max: number) =>
  Math.min(max, Math.floor(Math.sqrt(xp / (fl ? 1000 : 500))));
export const perRank = (fl: boolean | undefined) => (fl ? 200 : 100);

// Items the list doesn't know (Plexus, Venari, amp parts...): guessed from the path so MR stays right.
export function guess(type: string): MItem {
  const fl = /Powersuits|PowerSuit|Harness|Kavat|Kubrow/.test(type);
  const name = type.split("/").pop() ?? type;
  return { ru: name, en: name, name, icon: null, cat: "other", fl, max: 30 };
}

// Total mastery XP needed for a rank (legendary ranks past 30 add 147 500 each).
export const mrNeed = (n: number) => (n <= 30 ? 2500 * n * n : 2_250_000 + (n - 30) * 147_500);
export const MR_NAME = (n: number) => (n > 30 ? `L${n - 30}` : String(n));

export const RAILJACK_SKILLS = ["LPS_PILOTING", "LPS_GUNNERY", "LPS_TACTICAL", "LPS_ENGINEERING", "LPS_COMMAND"];
export const DUVIRI_SKILLS = ["LPS_DRIFT_COMBAT", "LPS_DRIFT_RIDING", "LPS_DRIFT_OPPORTUNITY", "LPS_DRIFT_ENDURANCE"];
const INTRINSIC_XP = 1500;

export type Status = "mastered" | "progress" | "none";

export interface Row {
  id: string;
  it: MItem;
  xp: number;
  rank: number;
  status: Status;
  gives: number; // mastery XP this item gives when maxed
  left: number; // mastery XP still to gain from it
}

export function summarize(db: MasteryDb, p: Profile, hideFounders = false) {
  const rows: Row[] = [];
  let itemXp = 0;
  const seen = new Set<string>();
  for (const [id, it] of Object.entries(db.items)) {
    const xp = p.xp[id] ?? 0;
    const rank = rankOf(xp, it.fl, it.max);
    const gives = it.max * perRank(it.fl);
    const got = rank * perRank(it.fl);
    itemXp += got;
    seen.add(id);
    if (hideFounders && FOUNDERS.has(id)) continue;
    rows.push({ id, it, xp, rank, gives, left: gives - got, status: rank >= it.max ? "mastered" : xp > 0 ? "progress" : "none" });
  }
  // Leveled items missing from the list still count toward MR.
  for (const [id, xp] of Object.entries(p.xp)) {
    if (seen.has(id)) continue;
    const g = guess(id);
    itemXp += rankOf(xp, g.fl, g.max) * perRank(g.fl);
  }

  // Star chart: nodes and junctions, normal and Steel Path.
  const chart = { normal: 0, normalAll: 0, junctions: 0, junctionsAll: 0, sp: 0, spJ: 0, xp: 0, unknown: 0 };
  for (const n of Object.values(db.chartNodes ?? db.nodes)) {
    if ("unknownXp" in n && n.unknownXp) chart.unknown++;
    if (n.j) chart.junctionsAll++;
    else chart.normalAll++;
  }
  // One entry per node: Tier 1 (sp) means done on the Steel Path as well, which gives its mastery again.
  for (const m of p.missions) {
    const n = (db.chartNodes ?? db.nodes)[m.tag];
    if (!n) continue;
    chart.xp += m.sp ? 2 * n.xp : n.xp;
    n.j ? chart.junctions++ : chart.normal++;
    if (m.sp) n.j ? chart.spJ++ : chart.sp++;
  }

  const lvl = (keys: string[]) => keys.reduce((s, k) => s + Math.min(10, p.skills[k] ?? 0), 0);
  const intr = { railjack: lvl(RAILJACK_SKILLS), railjackAll: 50, duviri: lvl(DUVIRI_SKILLS), duviriAll: 40 };
  const intrXp = (intr.railjack + intr.duviri) * INTRINSIC_XP;

  // Our count misses some sources (events, items outside the list), most for veterans: the game's MR
  // is the truth, so the total never drops below its floor (else the gap to L(n+1) looks > 147 500).
  const counted = itemXp + chart.xp + intrXp;
  const total = Math.max(counted, mrNeed(p.mr));
  const byCat = CAT_ORDER.map((cat) => {
    const list = rows.filter((r) => r.it.cat === cat);
    return {
      cat,
      all: list.length,
      mastered: list.filter((r) => r.status === "mastered").length,
      progress: list.filter((r) => r.status === "progress").length,
    };
  }).filter((c) => c.all);

  return {
    rows,
    total,
    counted,
    mr: p.mr,
    from: mrNeed(p.mr),
    to: mrNeed(p.mr + 1),
    chart,
    intr,
    byCat,
    counts: {
      mastered: rows.filter((r) => r.status === "mastered").length,
      progress: rows.filter((r) => r.status === "progress").length,
      none: rows.filter((r) => r.status === "none").length,
      all: rows.length,
    },
  };
}

// ---------- plan to the next rank
// Mastery still available from the player's gear, largest gains first: items already leveled
// (finish them), gear in the foundry, star chart nodes not done yet, Steel Path nodes. Rough minutes: an item 0→30
// ≈ 60 min (scaled by the affinity left, 40-rank items by their bigger total), a node ≈ 5 min,
// a Steel Path node ≈ 6 min. Pick by mastery gained, shorter leveling time breaks ties.
export function masteryFoundry(craft: CraftDb | null, pending: InvFoundry[] = []): Map<string, number> {
  const recipes = new Map<string, string>();
  for (const [id, item] of Object.entries(craft?.items ?? {})) {
    if (item.r) recipes.set(item.r, id);
    if (item.bp) recipes.set(item.bp, id);
  }
  const out = new Map<string, number>();
  for (const job of pending) {
    const id = recipes.get(job.id);
    if (id) out.set(id, Math.min(out.get(id) ?? Infinity, job.done));
  }
  return out;
}

export type PlanStep =
  | { kind: "item"; row: Row; xp: number; min: number; foundry?: number }
  | { kind: "nodes"; sp: boolean; tags: string[]; xp: number; min: number };

// `skip`: items put aside; `foundry`: output id -> completion time. Minutes cover leveling, not craft waits.
export function mrPlan(db: MasteryDb, p: Profile, sum: ReturnType<typeof summarize>, skip?: (r: Row) => boolean, noSp = false, foundry: ReadonlyMap<string, number> = new Map()) {
  const need = Math.max(0, sum.to - sum.total);
  type Cand = { xp: number; min: number; row?: Row; node?: string; sp?: boolean };
  const cands: Cand[] = [];
  for (const r of sum.rows) {
    if ((r.status !== "progress" && !(r.status === "none" && foundry.has(r.id))) || !r.left || skip?.(r)) continue;
    cands.push({ xp: r.left, min: Math.max(5, (60 * (r.it.max ** 2 - r.rank ** 2)) / 900), row: r });
  }
  const done = new Set(p.missions.map((m) => m.tag));
  const spDone = new Set(p.missions.filter((m) => m.sp).map((m) => m.tag));
  for (const [tag, n] of Object.entries(db.nodes)) {
    if (!n.xp || n.j) continue;
    if (!done.has(tag)) cands.push({ xp: n.xp, min: 5, node: tag, sp: false });
    else if (!noSp && !spDone.has(tag) && sum.chart.sp + sum.chart.spJ > 0) cands.push({ xp: n.xp, min: 6, node: tag, sp: true });
  }
  cands.sort((a, b) => b.xp - a.xp || a.min - b.min);
  const picked: Cand[] = [];
  let got = 0;
  for (const c of cands) {
    if (got >= need) break;
    picked.push(c);
    got += c.xp;
  }
  // Items one by one, nodes folded into one step per kind.
  const steps: PlanStep[] = [];
  for (const sp of [false, true]) {
    const ns = picked.filter((c) => c.node && c.sp === sp);
    if (ns.length) steps.push({ kind: "nodes", sp, tags: ns.map((c) => c.node!), xp: ns.reduce((s, c) => s + c.xp, 0), min: ns.reduce((s, c) => s + c.min, 0) });
  }
  for (const c of picked) if (c.row) steps.push({ kind: "item", row: c.row, xp: c.xp, min: c.min, foundry: foundry.get(c.row.id) });
  steps.sort((a, b) => b.xp - a.xp || a.min - b.min);
  return { need, got, short: Math.max(0, need - got), min: picked.reduce((s, c) => s + c.min, 0), steps };
}

// 135 -> "≈ 2 ч 15 мин"
export function duration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return t("unit.approxM", { m });
  return m % 60 ? t("unit.approxHM", { h: Math.floor(m / 60), m: m % 60 }) : t("unit.approxH", { h: m / 60 });
}
