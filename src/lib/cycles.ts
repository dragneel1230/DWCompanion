// Open-world day cycles. Earth and Orb Vallis run on fixed clocks; Cetus and the Cambion Drift
// follow the Cetus bounty cycle from worldState (150 min: 100 min day, last 50 min night).
// Checked against warframestat.us on 2026-09-29.

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

export function cycles(now: number, cetusEnd: number): Cycle[] {
  const e = now % EARTH_LOOP;
  const earthDay = e < EARTH_LOOP / 2;
  const earth: Cycle = {
    id: "earth",
    place: "Земля",
    state: earthDay ? "День" : "Ночь",
    kind: earthDay ? "day" : "night",
    ends: now - e + (earthDay ? EARTH_LOOP / 2 : EARTH_LOOP),
  };

  const v = (now - VALLIS_REF) % VALLIS_LOOP;
  const warm = v < VALLIS_WARM;
  const vallis: Cycle = {
    id: "vallis",
    place: "Долина Сфер",
    state: warm ? "Тепло" : "Холод",
    kind: warm ? "warm" : "cold",
    ends: now - v + (warm ? VALLIS_WARM : VALLIS_LOOP),
  };

  // Past the known cycle end, roll forward by whole 150-min cycles until worldState refreshes.
  let end = cetusEnd;
  while (end && end <= now) end += 150 * 60_000;
  const cetusDay = now < end - CETUS_NIGHT;
  const cetusEnds = cetusDay ? end - CETUS_NIGHT : end;
  const cetus: Cycle = { id: "cetus", place: "Цетус", state: cetusDay ? "День" : "Ночь", kind: cetusDay ? "day" : "night", ends: cetusEnds };
  const cambion: Cycle = { id: "cambion", place: "Камбионский Дрейф", state: cetusDay ? "Фэз" : "Воум", kind: cetusDay ? "fass" : "vome", ends: cetusEnds };

  return end ? [earth, cetus, vallis, cambion] : [earth, vallis];
}

export function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин ${sec} с`;
  return `${m} мин ${String(sec).padStart(2, "0")} с`;
}
