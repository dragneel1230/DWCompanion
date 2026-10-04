// Mastery math (wiki "Mastery Rank"): an item's rank from its affinity, the mastery XP it gives,
// star chart and intrinsics mastery, MR thresholds. Item list: static/data/mastery.json.
import type { Profile } from "$lib/profile.svelte";
import { dataUrl, labels, t } from "$lib/i18n/index.svelte";

export type MasteryCat =
  | "warframe" | "primary" | "secondary" | "melee" | "companion" | "companionweapon"
  | "archwing" | "archweapon" | "necramech" | "amp" | "other";

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
}

export interface MasteryDb {
  builtAt: string;
  items: Record<string, MItem>;
  nodes: Record<string, { xp: number; j?: 1 }>;
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
  other: "mastery.cat.other",
});
export const CAT_ORDER: MasteryCat[] = [
  "warframe", "primary", "secondary", "melee", "companion", "companionweapon", "archwing", "archweapon", "necramech", "amp",
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

export function summarize(db: MasteryDb, p: Profile) {
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
    rows.push({ id, it, xp, rank, gives, left: gives - got, status: rank >= it.max ? "mastered" : xp > 0 ? "progress" : "none" });
  }
  // Leveled items missing from the list still count toward MR.
  for (const [id, xp] of Object.entries(p.xp)) {
    if (seen.has(id)) continue;
    const g = guess(id);
    itemXp += rankOf(xp, g.fl, g.max) * perRank(g.fl);
  }

  // Star chart: nodes and junctions, normal and Steel Path.
  const chart = { normal: 0, normalAll: 0, junctions: 0, junctionsAll: 0, sp: 0, spJ: 0, xp: 0 };
  for (const [tag, n] of Object.entries(db.nodes)) {
    if (n.j) chart.junctionsAll++;
    else chart.normalAll++;
  }
  for (const m of p.missions) {
    const n = db.nodes[m.tag];
    if (!n) continue;
    chart.xp += n.xp;
    if (m.sp) n.j ? chart.spJ++ : chart.sp++;
    else n.j ? chart.junctions++ : chart.normal++;
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
// What gets the missing mastery soonest, from what the player surely has: items already leveled
// (finish them), star chart nodes not done yet, Steel Path nodes. Rough minutes: an item 0→30
// ≈ 60 min (scaled by the affinity left, 40-rank items by their bigger total), a node ≈ 5 min,
// a Steel Path node ≈ 6 min. Greedy by mastery per minute until the gap is covered.
export type PlanStep =
  | { kind: "item"; row: Row; xp: number; min: number }
  | { kind: "nodes"; sp: boolean; tags: string[]; xp: number; min: number };

// `skip`: items the player put aside, `noSp`: leave out Steel Path nodes.
export function mrPlan(db: MasteryDb, p: Profile, sum: ReturnType<typeof summarize>, skip?: (r: Row) => boolean, noSp = false) {
  const need = Math.max(0, sum.to - sum.total);
  type Cand = { xp: number; min: number; row?: Row; node?: string; sp?: boolean };
  const cands: Cand[] = [];
  for (const r of sum.rows) {
    if (r.status !== "progress" || !r.left || skip?.(r)) continue;
    cands.push({ xp: r.left, min: Math.max(5, (60 * (r.it.max ** 2 - r.rank ** 2)) / 900), row: r });
  }
  const done = new Set(p.missions.filter((m) => !m.sp).map((m) => m.tag));
  const spDone = new Set(p.missions.filter((m) => m.sp).map((m) => m.tag));
  for (const [tag, n] of Object.entries(db.nodes)) {
    if (!n.xp || n.j) continue;
    if (!done.has(tag)) cands.push({ xp: n.xp, min: 5, node: tag, sp: false });
    else if (!noSp && !spDone.has(tag) && sum.chart.sp + sum.chart.spJ > 0) cands.push({ xp: n.xp, min: 6, node: tag, sp: true });
  }
  cands.sort((a, b) => b.xp / b.min - a.xp / a.min);
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
  for (const c of picked) if (c.row) steps.push({ kind: "item", row: c.row, xp: c.xp, min: c.min });
  steps.sort((a, b) => b.xp / b.min - a.xp / a.min);
  return { need, got, short: Math.max(0, need - got), min: picked.reduce((s, c) => s + c.min, 0), steps };
}

// 135 -> "≈ 2 ч 15 мин"
export function duration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return t("unit.approxM", { m });
  return m % 60 ? t("unit.approxHM", { h: Math.floor(m / 60), m: m % 60 }) : t("unit.approxH", { h: m / 60 });
}
