// The «Неделя» tab (views/WeekView.svelte) and its short summary on «Сейчас» (hub/Weekly.svelte): this week's
// activities from worldState (api.ts getWeek) against what the player did (inventory InvWeek). Names and reward
// tables: static/data/<lang>/weekly.json (scripts/build-weekly.mjs). Everything the inventory says is as of its
// snapshot; without a snapshot statuses are unknown (null).
import { dataUrl } from "$lib/i18n/index.svelte";
import type { Week } from "$lib/api";
import type { InvData } from "$lib/inventory.svelte";
import type { FramesDb } from "$lib/frames";
import type { ShardColor } from "$lib/shards";

export type Reward = [string, string | null, number, number]; // name, icon, count, chance 0..1
type Named = [string | null, string | null]; // name, description

export interface WeeklyDb {
  nw: Record<string, [string, string, number, number?]>; // challenge key -> name, description, standing, required count
  cal: Record<string, string>; // calendar challenge path -> text
  rew: Record<string, string>; // reward store item -> name
  rewi: Record<string, string>; // reward store item -> icon
  drew?: Record<string, [string, string | null, number]>; // Descendia reward -> name, icon, count multiplier
  archons: Record<string, [string, string | null, ShardColor, string]>; // SORTIE_BOSS_* -> shard name, icon, color, archon
  inc: Record<string, [string, string | null, string, string[]]>; // Circuit choice -> adapter name, icon, adapter id, weapons
  rw: {
    archon: Reward[];
    netra: Reward[];
    lab: Reward[][]; // silver, gold, legendary
    hex: Reward[][];
    descent: Record<"arc" | "tri" | "triSp" | "boss" | "rare" | "unc" | "com", Reward[]>;
  };
  cq: {
    lab: Record<string, Named>; // deviations of Deep Archimedea
    hex: Record<string, Named>; // … of Temporal Archimedea
    risk: Record<string, Named>;
    mod: Record<string, Named>; // personal modifiers
    mt: Record<string, string>; // mission type -> name ("LAB:MT_DEFENSE": the lab's two-target defense)
    fac: Record<string, string>;
    title: Record<string, string | null>;
  };
  teshin: { epoch: number; items: [string, string | null, number][] }; // 8-week rotation from `epoch` (a Monday)
}

let cache: Promise<WeeklyDb> | null = null;
export function loadWeekly(): Promise<WeeklyDb> {
  cache ??= fetch(dataUrl("weekly.json")).then((r) => r.json() as Promise<WeeklyDb>);
  cache.catch(() => (cache = null));
  return cache;
}

export const NETRA_MAX = 5;
const WEEK = 7 * 86_400_000;
// The weekly reset: Monday 00:00 UTC (1970-01-05 was a Monday).
const MONDAY = 4 * 86_400_000;
export const weekStart = (now: number) => now - ((now - MONDAY) % WEEK);
export const weekEnd = (now: number) => weekStart(now) + WEEK;

const live = (until: number, now: number) => until > now;

// Netracell runs left this week; null without an inventory.
export function netraLeft(inv: InvData | null, now: number): number | null {
  if (!inv) return null;
  const n = inv.week?.netra;
  return NETRA_MAX - (n && live(n[1], now) ? Math.min(NETRA_MAX, n[0]) : 0);
}

// Descendia: floors claimed this week (normal / Steel Path); null without an inventory.
export function descentFloor(inv: InvData | null, cat: "DM_COH_NORMAL" | "DM_COH_HARD", now: number): number | null {
  if (!inv?.week) return null;
  const d = inv.week.descent[cat];
  return d && live(d[1], now) ? d[0] : 0;
}

export type DescentReward = [number, [string, number][]];
export function descentRewards(inv: InvData | null, cat: "DM_COH_NORMAL" | "DM_COH_HARD", now: number): DescentReward[] {
  const d = inv?.week?.descent[cat];
  return d && live(d[1], now) ? (d[2] ?? []) : [];
}

export const archonDone = (inv: InvData | null, w: Week) => (inv?.week && w.archon ? inv.week.archon.includes(w.archon.id) : null);

// One mission of the Archon hunt: "<node>_<hunt id>" in CompletedSorties; null when the snapshot doesn't keep it.
export function archonStage(inv: InvData | null, w: Week, node: string): boolean | null {
  if (!w.archon || !inv?.week?.stages) return null;
  return inv.week.stages.includes(`${node}_${w.archon.id}`) || inv.week.archon.includes(w.archon.id);
}

// 1999 calendar: the last completed day of this season (-1: none); null without an inventory.
export function calendarDay(inv: InvData | null, w: Week): number | null {
  const c = inv?.week?.cal;
  if (!inv?.week || !w.calendar) return null;
  return c && c.season === w.calendar.season && c.it === w.calendar.it ? c.day : -1;
}

// Nightwave challenge: [progress, required]. SeasonChallengeHistory lists every challenge the player was *given*
// (even untouched ones), so "done" is the progress counter (ChallengeProgress) reaching the required count.
// null: no snapshot, or one taken before 2026-10-11 (v0.2.3) without the counters.
export function nightwaveProgress(inv: InvData | null, ch: { id: string; key: string }, db: WeeklyDb | null | undefined): [number, number] | null {
  const wk = inv?.week;
  const need = db?.nw[ch.key]?.[3] ?? 1;
  if (!wk) return null;
  if (!wk.nw.includes(ch.id)) return [0, need];
  if (!wk.nwProg) return null;
  return [Math.min(wk.nwProg[ch.key] ?? 0, need), need];
}
export function nightwaveDone(inv: InvData | null, ch: { id: string; key: string }, db: WeeklyDb | null | undefined): boolean | null {
  const p = nightwaveProgress(inv, ch, db);
  return p ? p[0] >= p[1] : null;
}

// A weekly NPC mission (Clem, Maroo) done since this week's reset; null when the snapshot doesn't keep it.
export function periodicDone(inv: InvData | null, prefix: string, now: number): boolean | null {
  const p = inv?.week?.periodic;
  if (!p) return null;
  const from = weekStart(now);
  return Object.entries(p).some(([tag, at]) => tag.startsWith(prefix) && at >= from);
}

// Teshin's Steel Path offer this week and the next ones.
export function teshinOffer(wdb: WeeklyDb, now: number, ahead = 0) {
  const { epoch, items } = wdb.teshin;
  const i = Math.floor((weekStart(now) - epoch) / WEEK) + ahead;
  return items[((i % items.length) + items.length) % items.length];
}

// A Circuit warframe choice ("Saryn") -> the warframe, and whether any variant of it (Prime too) is owned.
export function circuitFrame(fdb: FramesDb | null, inv: InvData | null, choice: string) {
  if (!fdb) return null;
  const base = Object.entries(fdb.frames).find(([, f]) => f.en === choice);
  if (!base) return null;
  const owned = inv ? Object.entries(fdb.frames).some(([id, f]) => (f.en === choice || f.en === `${choice} Prime`) && inv.arsenal.includes(id)) : null;
  return { id: base[0], name: base[1].name, icon: base[1].icon, owned };
}

// A Circuit Incarnon choice: installed on one of its weapons, or the adapter is waiting in the inventory.
export function circuitIncarnon(wdb: WeeklyDb | null, inv: InvData | null, choice: string) {
  const x = wdb?.inc[choice];
  if (!x) return null;
  const [name, icon, adapter, fits] = x;
  const installed = inv?.week ? fits.some((w) => inv.week!.incarnon.includes(w)) : null;
  const held = inv ? (inv.items[adapter] ?? 0) > 0 : null;
  return { name, icon, installed, held };
}

// A calendar reward / upgrade id as the name lookup keeps it.
export const rewardName = (wdb: WeeklyDb | null, id: string) =>
  wdb?.rew[id] ?? wdb?.rew[id.replace("/Lotus/StoreItems/", "/Lotus/")] ?? id.split("/").pop()!.replace(/([a-z])([A-Z])/g, "$1 $2");
export const rewardIcon = (wdb: WeeklyDb | null, id: string) => wdb?.rewi[id] ?? wdb?.rewi[id.replace("/Lotus/StoreItems/", "/Lotus/")] ?? null;

const rewardTail = (id: string) => id.split("/").pop() ?? id;
export function descentReward(wdb: WeeklyDb | null, id: string): [string, string | null, number] {
  const box = wdb?.drew;
  if (box) {
    const normalized = id.replace("/StoreItems/", "/");
    const key = box[id] ? id : box[normalized] ? normalized : Object.keys(box).find((k) => rewardTail(k) === rewardTail(id));
    if (key) return box[key];
  }
  return [rewardName(wdb, id), rewardIcon(wdb, id), 1];
}

// "ChannelDrain" -> "Channel Drain": a modifier DE's strings don't name.
export const untag = (s: string) => s.replace(/^NC_/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
