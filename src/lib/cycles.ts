// Open-world day cycles. Earth and Orb Vallis run on fixed clocks; Cetus and the Cambion Drift
// follow the Cetus bounty cycle from worldState (150 min: 100 min day, last 50 min night).
// Checked against warframestat.us on 2026-09-29.
import { t } from "$lib/i18n/index.svelte";

export interface Cycle {
  id: "earth" | "cetus" | "vallis" | "cambion";
  place: string;
  state: string;
  kind: "day" | "night" | "warm" | "cold" | "fass" | "vome";
  ends: number;
}

const EARTH_LOOP = 8 * 3600_000; // 4 h day, then 4 h night, from the Unix epoch
const VALLIS_REF = 1541837628000; // start of a warm phase
const VALLIS_LOOP = 1600_000; // 6:40 warm, 20:00 cold
const VALLIS_WARM = 400_000;
const CETUS_NIGHT = 50 * 60_000;

// Simple glyphs per state (24×24 strokes).
export const CYCLE_ICON: Record<Cycle["kind"], string> = {
  day: "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  night: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  warm: "M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z",
  cold: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5",
  fass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  vome: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 9h6",
};

export function cycles(now: number, cetusEnd: number): Cycle[] {
  const e = now % EARTH_LOOP;
  const earthDay = e < EARTH_LOOP / 2;
  const earth: Cycle = {
    id: "earth",
    place: t("cycle.earth"),
    state: earthDay ? t("cycle.day") : t("cycle.night"),
    kind: earthDay ? "day" : "night",
    ends: now - e + (earthDay ? EARTH_LOOP / 2 : EARTH_LOOP),
  };

  const v = (now - VALLIS_REF) % VALLIS_LOOP;
  const warm = v < VALLIS_WARM;
  const vallis: Cycle = {
    id: "vallis",
    place: t("cycle.vallis"),
    state: warm ? t("cycle.warm") : t("cycle.cold"),
    kind: warm ? "warm" : "cold",
    ends: now - v + (warm ? VALLIS_WARM : VALLIS_LOOP),
  };

  // Past the known cycle end, roll forward by whole 150-min cycles until worldState refreshes.
  let end = cetusEnd;
  while (end && end <= now) end += 150 * 60_000;
  const cetusDay = now < end - CETUS_NIGHT;
  const cetusEnds = cetusDay ? end - CETUS_NIGHT : end;
  const cetus: Cycle = { id: "cetus", place: t("cycle.cetus"), state: cetusDay ? t("cycle.day") : t("cycle.night"), kind: cetusDay ? "day" : "night", ends: cetusEnds };
  const cambion: Cycle = { id: "cambion", place: t("cycle.cambion"), state: cetusDay ? t("cycle.fass") : t("cycle.vome"), kind: cetusDay ? "fass" : "vome", ends: cetusEnds };

  return end ? [earth, cetus, vallis, cambion] : [earth, vallis];
}

export function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return t("unit.dh", { d, h });
  if (h) return t("unit.hms", { h, m, s: sec });
  return t("unit.ms", { m, s: String(sec).padStart(2, "0") });
}
