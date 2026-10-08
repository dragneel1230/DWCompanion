// Weapon / companion / archwing / necramech builds the user made, saved locally (warframes: userBuilds).
import type { GearBuild } from "$lib/gear";

const KEY = "dwc.gearBuilds";

function readSaved(): Record<string, GearBuild> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

class GearBuilds {
  all = $state<Record<string, GearBuild>>(readSaved());

  of(item: string): [string, GearBuild][] {
    return Object.entries(this.all).filter(([, b]) => b.item === item);
  }

  save(id: string, build: GearBuild) {
    this.all = { ...this.all, [id]: build };
    this.#persist();
  }

  remove(id: string) {
    const { [id]: _, ...rest } = this.all;
    this.all = rest;
    this.#persist();
  }

  #persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.all));
    } catch {
      // storage unavailable: builds live for this session only
    }
  }
}

export const gearBuilds = new GearBuilds();

// The hub window follows builds saved in the app (localStorage is shared).
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) gearBuilds.all = readSaved();
  });
