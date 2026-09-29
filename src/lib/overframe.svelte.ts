// Import of Overframe "Copy" build links. The link carries ?bs=<base64 JSON>:
//   [version, overframeItemId, level, reactor, [[overframeModId, rank, slotPolarity], ...]]
// Entry order: 8 mod slots, then aura / exilus, then arcanes. Archon shards are not in the code.
// Overframe uses its own numeric ids, so we keep an id -> English name table: a seed of ids
// already checked by hand, plus ids the user resolved in the app (saved locally).

const SEED: Record<number, string> = {
  // warframes
  20: "Excalibur Umbra",
  53: "Saryn Prime",
  // mods
  65: "Cunning Drift",
  67: "Power Drift",
  110: "Chromatic Blade",
  180: "Venom Dose",
  299: "Brief Respite",
  312: "Steel Charge",
  693: "Umbral Vitality",
  694: "Umbral Fiber",
  695: "Umbral Intensify",
  792: "Blind Rage",
  793: "Transient Fortitude",
  794: "Overextended",
  800: "Primed Continuity",
  802: "Primed Flow",
  806: "Stretch",
  831: "Equilibrium",
  1430: "Rolling Guard",
  6284: "Catalyzing Shields",
  // arcanes
  2174: "Arcane Fury",
  2186: "Arcane Strike",
  5866: "Molt Augmented",
  8004: "Arcane Sculptor",
};

const KEY = "dwc.overframeIds";

function readSaved(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

class OverframeIds {
  #user = $state<Record<number, string>>(readSaved());

  name(id: number): string | undefined {
    return this.#user[id] ?? SEED[id];
  }

  remember(id: number, enName: string) {
    this.#user = { ...this.#user, [id]: enName };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#user));
    } catch {
      // storage unavailable: mapping lives for this session only
    }
  }
}

export const overframeIds = new OverframeIds();

export interface DecodedBuild {
  itemId: number;
  buildId: number | null;
  url: string | null;
  entries: { id: number; rank: number; pol: number }[];
}

// Accepts the full link or just the bs= value.
export function decodeOverframe(input: string): DecodedBuild | null {
  const text = input.trim();
  const bs = /[?&]bs=([^&\s#]+)/.exec(text)?.[1] ?? (/^[A-Za-z0-9+/=%_-]+$/.test(text) ? text : null);
  if (!bs) return null;
  try {
    const json = atob(decodeURIComponent(bs).replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    if (!Array.isArray(data) || !Array.isArray(data[4])) return null;
    const url = /^https?:\/\//.test(text) ? text.split(/\s/)[0] : null;
    return {
      itemId: Number(data[1]),
      buildId: Number(/\/build\/(\d+)\//.exec(text)?.[1]) || null,
      url,
      entries: data[4].map((e: number[]) => ({ id: Number(e[0]), rank: Number(e[1]), pol: Number(e[2]) })),
    };
  } catch {
    return null;
  }
}
