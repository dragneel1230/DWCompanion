// Overlay settings. localStorage is shared by the main window and the overlay window (same origin),
// the Rust side gets "enabled" / "record" so it doesn't capture the screen when the overlay is off.
import { invoke } from "@tauri-apps/api/core";
import type { CollMode } from "$lib/collection/need";

// What "Лучший выбор" is picked by. "collection": parts the player is missing (collection/need.ts), in `collMode`.
export type Priority = "platinum" | "ducats" | "collection";

export interface OverlaySettings {
  enabled: boolean;
  priority: Priority;
  collMode: CollMode; // "collection": sets to sell or sets for mastery
  record: boolean; // debug: save screen recordings and scan frames
  kiosk: boolean; // hints at the ducat kiosk (kiosk.rs)
}

const KEY = "dwc.overlay";
const DEFAULTS: OverlaySettings = { enabled: true, priority: "platinum", collMode: "sell", record: false, kiosk: true };

export function readOverlaySettings(): OverlaySettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

class Store {
  value = $state<OverlaySettings>(readOverlaySettings());

  set(patch: Partial<OverlaySettings>) {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage unavailable: settings last for this session
    }
    this.sync();
  }

  sync() {
    invoke("overlay_config", { enabled: this.value.enabled, record: this.value.record }).catch(() => {});
    invoke("kiosk_config", { enabled: this.value.kiosk }).catch(() => {});
  }
}

export const overlaySettings = new Store();
