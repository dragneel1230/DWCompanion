// "Do I have this mod?" — one entry point for every source of truth: the inventory snapshot
// (inventory.svelte.ts) plus manual marks and the Mods screen scan, saved locally.
import { inventory } from "$lib/inventory.svelte";

const KEY = "dwc.ownedMods";

function readSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

class Owned {
  #ids = $state(new Set<string>(readSaved()));

  has(id: string): boolean {
    return this.#ids.has(id) || inventory.hasMod(id);
  }

  // Known from the inventory: a manual mark can't take it away.
  fromInv(id: string): boolean {
    return inventory.hasMod(id);
  }

  // Manual marks only.
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
