// Mod inventory scan: the Rust side OCRs the game window while the user scrolls the Mods screen
// (src-tauri/src/inventory.rs); here the text lines are matched to mod names and collected.
// Results live in memory until the user saves them into the "owned" marks.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadFrames } from "$lib/frames";
import { buildIndex, namesIn, type Index, type Line } from "$lib/modMatch";

interface InvFrame {
  lines: Line[];
  w: number;
  h: number;
  ocr_ms: number;
}

export interface Found {
  name: string;
  ids: string[];
  keep: boolean; // unticked by the user = not saved
}

let index: Index | null = null;

async function getIndex(): Promise<Index> {
  index ??= buildIndex((await loadFrames()).modNames);
  return index;
}

class ModScan {
  running = $state(false);
  error = $state("");
  found = $state<Found[]>([]);
  frames = $state(0);
  ocrMs = $state(0);
  unmatched = $state<string[]>([]); // text of the last frame that is not a mod name, for tuning
  #listening = false;

  async #listen() {
    if (this.#listening) return;
    this.#listening = true;
    await listen<InvFrame>("inv-frame", async (e) => {
      const { hits, used } = namesIn(e.payload.lines, await getIndex());
      const known = new Set(this.found.map((f) => f.name));
      const fresh = hits.map((h) => h.entry).filter((n) => !known.has(n.name) && known.add(n.name));
      if (fresh.length) this.found = [...fresh.map((n) => ({ name: n.name, ids: n.ids, keep: true })), ...this.found];
      this.unmatched = e.payload.lines.filter((l) => !used.has(l)).map((l) => l.text);
      this.frames++;
      this.ocrMs = e.payload.ocr_ms;
    });
    await listen<string>("inv-stopped", (e) => {
      this.running = false;
      this.error = e.payload;
    });
  }

  async start() {
    this.error = "";
    await getIndex();
    await this.#listen();
    try {
      await invoke("inv_scan_start");
      this.running = true;
    } catch (e) {
      this.error = String(e);
    }
  }

  async stop() {
    await invoke("inv_scan_stop").catch(() => {});
    this.running = false;
  }

  clear() {
    this.found = [];
    this.frames = 0;
    this.unmatched = [];
  }

  keptIds(): string[] {
    return this.found.filter((f) => f.keep).flatMap((f) => f.ids);
  }
}

export const modScan = new ModScan();
