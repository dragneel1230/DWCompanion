// Builds the user imported or made, saved locally. Merged with the bundled builds in frames.ts.
import type { Build } from "$lib/frames";

const KEY = "dwc.userBuilds";

function readSaved(): Record<string, Build> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

class UserBuilds {
  all = $state<Record<string, Build>>(readSaved());

  save(id: string, build: Build) {
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

export const userBuilds = new UserBuilds();

// The hub window follows builds saved in the app (localStorage is shared).
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) userBuilds.all = readSaved();
  });
