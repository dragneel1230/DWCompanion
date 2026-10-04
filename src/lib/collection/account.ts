// Names for the rest of the public profile (static/data/account.json, scripts/build-mastery.mjs):
// syndicates with their ranks, abilities, enemies, items outside the mastery list. Plus daily limits.
import { dataUrl, labels, num, t } from "$lib/i18n/index.svelte";

export interface SyndicateInfo {
  name: string;
  icon: string | null;
  color: string | null;
  bin: string; // daily limit bin: NORMAL, CETUS, …
  titles: { lvl: number; name: string; min: number; max: number }[];
}

export interface AccountDb {
  syndicates: Record<string, SyndicateInfo>;
  abilities: Record<string, { name: string; icon: string | null }>;
  enemies: Record<string, string>;
  names: Record<string, { name: string; icon: string | null }>;
}

let cache: Promise<AccountDb> | null = null;
export function loadAccount(): Promise<AccountDb> {
  cache ??= fetch(dataUrl("account.json")).then((r) => r.json() as Promise<AccountDb>);
  return cache;
}

// Focus schools by the loadout's FocusSchool polarity.
export const FOCUS_RU: Record<string, string> = labels({
  AP_ATTACK: "focus.madurai",
  AP_DEFENSE: "focus.vazarin",
  AP_TACTIC: "focus.naramon",
  AP_POWER: "focus.zenurik",
  AP_WARD: "focus.unairu",
});

// Daily caps (wiki "Syndicates", "Focus"): standing 16 000 + 500·MR per bin, focus 250 000 + 5 000·MR.
export const standingCap = (mr: number) => 16_000 + 500 * mr;
export const focusCap = (mr: number) => 250_000 + 5_000 * mr;

// Daily reset is 00:00 UTC: a profile read before it is out of date — everything is allowed again.
export function lastReset(now = Date.now()): number {
  return Math.floor(now / 86_400_000) * 86_400_000;
}
export function leftToday(value: number | undefined, cap: number, at: number): number {
  if (value == null) return cap;
  return at < lastReset() ? cap : Math.max(0, Math.min(cap, value));
}

// Syndicate rank of a standing value: "Сура", next rank and how far into the current one.
export function rankOf(s: SyndicateInfo, title: number, standing: number) {
  const cur = s.titles.find((t) => t.lvl === title);
  const next = s.titles.find((t) => t.lvl === title + 1);
  // Rank 0 (neutral) has no entry: it spans 0 .. the first rank's threshold.
  const lo = cur?.min ?? 0;
  const hi = cur?.max ?? next?.min ?? lo;
  const into = hi > lo ? (standing - lo) / (hi - lo) : next ? 0 : 1;
  return { cur, next, hi, into: Math.max(0, Math.min(1, into)), capped: standing >= hi };
}

// 1 214 965 s -> "337 ч"
export function hours(sec: number): string {
  return t("unit.hours", { v: num(Math.round(sec / 3600)) });
}

// 18 318 265 -> "18,3 млн"
export function big(n: number): string {
  if (n >= 1e9) return t("unit.billion", { v: num(n / 1e9, 1) });
  if (n >= 1e6) return t("unit.million", { v: num(n / 1e6, 1) });
  if (n >= 1e4) return t("unit.thousand", { v: Math.round(n / 1e3) });
  return num(Math.round(n));
}
