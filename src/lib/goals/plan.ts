// Goal guide: a step-by-step plan to get any warframe / weapon / companion / archwing / gear, prime or not,
// from DE's data: craft.json (recipes, where blueprints come from), drops.json (drop tables, resources),
// db.json (relics). Pure: progress lives in goals.svelte.ts, live hints (fissures, prices) on the page.
import { getDb, type Rarity } from "$lib/db";
import { pct, type Drop, type DropsDb, type SourceKind, type Src } from "$lib/drops";
import { totals, whereShort, type CraftDb, type CraftItem } from "$lib/craft";
import { orderSrc, srcText } from "$lib/farm";
import { num, t } from "$lib/i18n/index.svelte";

// "bp": a blueprint from the Market / lab / quest / vendor / drop tables; "relic": a prime blueprint or
// part (relic reward); "item": another weapon or frame the recipe eats (Akbronco takes two Broncos).
export type StepKind = "bp" | "relic" | "item" | "res" | "other" | "build" | "rank";
export type HowIcon = SourceKind | "market" | "lab" | "quest" | "syndicate" | "vendor";

export interface How {
  icon: HowIcon;
  text: string;
  sub?: string;
}

export interface RelicRef {
  key: string;
  s: string; // "Лит P9"
  era: string; // "Lith"
  rarity: Rarity;
  vaulted: boolean;
}

export interface Step {
  key: string; // stable: progress is stored by it
  kind: StepKind;
  id: string; // item / resource id
  name: string;
  icon: string | null;
  count: number;
  how: How[];
  relics?: RelicRef[];
  reward?: string; // relic steps: the db item that drops (journal marks it)
  slug?: string; // warframe.market slug: "or buy it"
  time?: number; // build steps: seconds
  credits?: number;
  main?: boolean; // the goal item itself (its blueprint / its build)
  bpId?: string; // bp / relic steps: the blueprint as the inventory names it
  direct?: boolean; // sold ready-made (no blueprint, nothing to build)
}

export type SectionId = "bp" | "res" | "build" | "rank";
export interface Section {
  id: SectionId;
  steps: Step[];
}

export interface Plan {
  id: string;
  item: CraftItem;
  prime: boolean;
  frameLike: boolean; // ranks cost 1000 xp, mastery 200 per rank
  sections: Section[];
  credits: number; // foundry + blueprints bought for credits
  time: number; // foundry, longest chain
  known: boolean; // DE's data says where the blueprint comes from
}

const RARITY_ORDER: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2 };
export const ERA_NUM: Record<string, number> = { Lith: 1, Meso: 2, Neo: 3, Axi: 4, Requiem: 5 };
const FRAME_LIKE = new Set(["frame", "companion", "archwing", "mech"]);

// Relics that hold a reward: active first, then the easier rarity.
export function relicsOf(itemId: string): RelicRef[] {
  const d = getDb();
  return (d.items[itemId]?.relics ?? [])
    .filter((x) => d.relics[x.relic])
    .map((x) => {
      const r = d.relics[x.relic];
      return { key: x.relic, s: r.s, era: r.era, rarity: x.rarity, vaulted: r.vaulted };
    })
    .sort((a, b) => +a.vaulted - +b.vaulted || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || (ERA_NUM[a.era] ?? 9) - (ERA_NUM[b.era] ?? 9));
}

const NOT_DROP = new Set<HowIcon>(["market", "lab", "quest", "syndicate", "vendor"]);

// Where a blueprint (or the thing itself) comes from, in plain words. Conclave and events go last.
// `max`: lines in all, before the "go here" places (vendors count too).
export function sourcesOf(c: { src?: Src[]; drops?: Drop[] }, drops: DropsDb, max = 3): How[] {
  const out: How[] = [];
  for (const s of orderSrc(c.src)) {
    if (s.k === "market")
      out.push({ icon: "market", text: s.cr ? t("goal.how.market", { v: num(s.cr) }) : t("goal.how.marketPl", { v: s.pl ?? 0 }) });
    else out.push({ icon: s.k, text: srcText(s) });
  }
  const list = [...(c.drops ?? [])].sort((a, b) => +(drops.sources[a[0]].kind === "other") - +(drops.sources[b[0]].kind === "other"));
  // Demolishers and the like: the enemy only shows up in some missions — name the mission first, and
  // enemies met in the same place make one line ("Ur (Уран)": three demolisher kinds).
  const byPlace = new Map<string, How & { who: string[]; best: number }>();
  for (const [si, rots] of list) {
    const s = drops.sources[si];
    const best = Math.max(...rots.map((r) => r[1]));
    const rot = [...new Set(rots.map((r) => r[0]).filter(Boolean))].join("/");
    if (s.at) {
      const key = s.at[0];
      const g = byPlace.get(key);
      if (g) {
        g.who.push(s.name);
        g.best = Math.max(g.best, best);
      } else byPlace.set(key, { icon: s.kind, text: key, who: [s.name], best, sub: s.sub?.split(" · ")[0] ?? "" });
      continue;
    }
    if (out.length - byPlace.size >= max) continue;
    const sub = [s.sub, rot ? t("goal.rot", { v: rot }) : "", t("goal.chance", { v: pct(best) })];
    out.push({ icon: s.kind, text: s.name, sub: sub.filter(Boolean).join(" · ") });
  }
  const placed = [...byPlace.values()].map((g) => ({
    icon: g.icon,
    text: g.text,
    sub: [g.sub, g.who.join(", "), t("goal.chance", { v: pct(g.best) })].filter(Boolean).join(" · "),
  }));
  // Order: sources that aren't drops (Market, lab, quest…), then "go here" places, then plain drops.
  const firstDrop = out.findIndex((h) => !NOT_DROP.has(h.icon));
  out.splice(firstDrop === -1 ? out.length : firstDrop, 0, ...placed);
  return out;
}

// A mod or arcane: vendors and syndicates, then missions, bounties, enemies; up to six drop lines.
const KIND_ORDER: Record<SourceKind, number> = { mission: 0, bounty: 1, enemy: 2, other: 3 };
export function modSourcesOf(drops: DropsDb, id: string): How[] {
  const m = drops.mods?.[id];
  if (!m) return [];
  const list = [...(m.drops ?? [])].sort((a, b) => KIND_ORDER[drops.sources[a[0]].kind] - KIND_ORDER[drops.sources[b[0]].kind] || b[2] - a[2]);
  return sourcesOf({ src: m.src, drops: list }, drops, (m.src?.length ?? 0) + 6);
}

function bpStep(key: string, id: string, c: CraftItem, drops: DropsDb, count: number, main: boolean): Step {
  const d = getDb();
  const prime = c.bp ? d.items[c.bp] : undefined;
  if (prime && c.bp) {
    return { key, kind: "relic", id, name: c.name, icon: prime.icon ?? c.icon, count, how: [], relics: relicsOf(c.bp), reward: c.bp, slug: prime.slug, main, bpId: c.bp };
  }
  // Sold ready-made only (Ergo Glast's Dogmat weapons): "get it", and no foundry step.
  const direct = !!c.src?.length && c.src.every((s) => "direct" in s && s.direct) && !c.drops?.length;
  return { key, kind: "bp", id, name: c.name, icon: c.icon, count, how: sourcesOf(c, drops), main, direct, bpId: c.bp ?? c.r };
}

export function makePlan(craft: CraftDb, drops: DropsDb, id: string): Plan | null {
  const c = craft.items[id];
  if (!c) return null;
  const d = getDb();
  const tot = totals(craft, drops, id);

  // Same ingredient listed twice (Akbronco: Bronco, Bronco) counts once with the sum.
  const parts = new Map<string, number>();
  for (const [pid, n] of c.parts) parts.set(pid, (parts.get(pid) ?? 0) + n);

  const bps: Step[] = [bpStep(`bp:${id}`, id, c, drops, 1, true)];
  const builds: Step[] = [];
  const others: Step[] = [];
  let bpCredits = (c.src ?? []).find((s) => s.k === "market")?.cr ?? 0;

  for (const [pid, n] of parts) {
    if (drops.resources[pid]) continue; // the resources section
    const cp = craft.items[pid];
    if (cp?.kind === "part") {
      bps.push(bpStep(`bp:${pid}`, pid, cp, drops, n, false));
      bpCredits += ((cp.src ?? []).find((s) => s.k === "market")?.cr ?? 0) * n;
      builds.push({ key: `build:${pid}`, kind: "build", id: pid, name: cp.name, icon: cp.icon, count: n, how: [], time: cp.time, credits: cp.credits * n });
    } else if (!cp && d.items[pid]) {
      // A prime weapon part: the relic reward itself, nothing to build.
      const it = d.items[pid];
      bps.push({ key: `relic:${pid}`, kind: "relic", id: pid, name: it.name, icon: it.icon, count: n, how: [], relics: relicsOf(pid), reward: pid, slug: it.slug });
    } else if (cp) {
      // Another weapon or frame: a goal of its own (the page offers to add it).
      const src = cp.bp && d.items[cp.bp] ? [] : sourcesOf(cp, drops);
      bps.push({ key: `item:${pid}`, kind: "item", id: pid, name: cp.name, icon: cp.icon, count: n, how: src, relics: cp.bp ? relicsOf(cp.bp) : undefined });
    } else {
      const nm = craft.names[pid];
      others.push({ key: `other:${pid}`, kind: "other", id: pid, name: nm?.name ?? pid.split("/").pop() ?? pid, icon: nm?.icon ?? null, count: n, how: [] });
    }
  }

  const res: Step[] = tot.resources.map(([rid, n]) => {
    const r = drops.resources[rid];
    const where = whereShort(drops, rid);
    return { key: `res:${rid}`, kind: "res", id: rid, name: r.name, icon: r.icon, count: n, how: where ? [{ icon: "mission", text: where }] : [] };
  });
  for (const [oid, n] of tot.other) {
    if (others.some((o) => o.id === oid) || d.items[oid] || craft.items[oid]) continue;
    const nm = craft.names[oid];
    others.push({ key: `other:${oid}`, kind: "other", id: oid, name: nm?.name ?? oid.split("/").pop() ?? oid, icon: nm?.icon ?? null, count: n, how: [] });
  }

  if (!bps[0].direct)
    builds.push({ key: `build:${id}`, kind: "build", id, name: c.name, icon: c.icon, count: 1, how: [], time: c.time, credits: c.credits, main: true });

  const frameLike = FRAME_LIKE.has(c.kind);
  const rank: Step = { key: `rank:${id}`, kind: "rank", id, name: c.name, icon: c.icon, count: 1, how: [], main: true };

  const sections: Section[] = [
    { id: "bp", steps: bps },
    { id: "res", steps: [...res, ...others] },
    { id: "build", steps: builds },
    { id: "rank", steps: [rank] },
  ].filter((s) => s.steps.length) as Section[];

  const known = bps[0].kind === "relic" ? !!bps[0].relics?.length : bps[0].how.length > 0;
  const direct = !!bps[0].direct;
  return { id, item: c, prime: !!c.bp, frameLike, sections, credits: direct ? bpCredits : tot.credits + bpCredits, time: direct ? 0 : tot.time, known };
}

// Mastery for ranking it to 30 (frames, companions, archwings: 200 per rank; weapons 100).
export const masteryOf = (p: Plan) => (p.frameLike ? 6000 : 3000);
// Affinity at rank 30 (the profile gives affinity per item).
export const xpFor30 = (p: Plan) => (p.frameLike ? 900_000 : 450_000);
