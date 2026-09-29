// "Do I have this mod?" — one entry point for every source of truth.
// Today: manual marks and the Mods screen scan (Inventory tab), saved locally. Later: the inventory source DE approves (see docs/DE_REQUEST.md);
// it plugs in here and the UI stays the same.

export type OwnSource = "manual" | "inventory";

const KEY = "dwc.ownedMods";

function readSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

class Owned {
  source: OwnSource = "manual";
  #ids = $state(new Set<string>(readSaved()));

  has(id: string): boolean {
    return this.#ids.has(id);
  }

  get count(): number {
    return this.#ids.size;
  }

  toggle(id: string) {
    const next = new Set(this.#ids);
    if (!next.delete(id)) next.add(id);
    this.#save(next);
  }

  // From an inventory scan: add to the marks, or make the marks exactly the scanned set.
  // Both return the previous marks, for undo.
  addMany(ids: Iterable<string>): string[] {
    const prev = [...this.#ids];
    this.#save(new Set([...this.#ids, ...ids]));
    return prev;
  }

  replace(ids: Iterable<string>): string[] {
    const prev = [...this.#ids];
    this.#save(new Set(ids));
    return prev;
  }

  #save(next: Set<string>) {
    this.#ids = next;
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable: marks live for this session only
    }
  }
}

export const owned = new Owned();
