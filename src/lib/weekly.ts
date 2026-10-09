// The weekly panel of «Сейчас»: this week's activities from worldState (api.ts getWeek) against what the player
// did (inventory InvWeek). Names: static/data/<lang>/weekly.json (scripts/build-weekly.mjs). Everything the
// inventory says is as of its snapshot; without a snapshot statuses are unknown (null).
import { dataUrl } from "$lib/i18n/index.svelte";
import type { Week } from "$lib/api";
import type { InvData } from "$lib/inventory.svelte";
import type { FramesDb } from "$lib/frames";
import type { ShardColor } from "$lib/shards";

export interface WeeklyDb {
  nw: Record<string, [string, string, number]>; // challenge key -> name, description, standing
  cal: Record<string, string>; // calendar challenge path -> text
  rew: Record<string, string>; // reward store item -> name
  archons: Record<string, [string, string | null, ShardColor]>; // SORTIE_BOSS_* -> shard name, icon, color
  inc: Record<string, [string, string | null, string, string[]]>; // Circuit choice -> adapter name, icon, adapter id, weapons
}

let cache: Promise<WeeklyDb> | null = null;
export function loadWeekly(): Promise<WeeklyDb> {
  cache ??= fetch(dataUrl("weekly.json")).then((r) => r.json() as Promise<WeeklyDb>);
  cache.catch(() => (cache = null));
  return cache;
}

export const NETRA_MAX = 5;

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

export const archonDone = (inv: InvData | null, w: Week) => (inv?.week && w.archon ? inv.week.archon.includes(w.archon.id) : null);

// 1999 calendar: the last completed day of this season (-1: none); null without an inventory.
export function calendarDay(inv: InvData | null, w: Week): number | null {
  const c = inv?.week?.cal;
  if (!inv?.week || !w.calendar) return null;
  return c && c.season === w.calendar.season && c.it === w.calendar.it ? c.day : -1;
}

export const nightwaveDone = (inv: InvData | null, id: string) => (inv?.week ? inv.week.nw.includes(id) : null);

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
