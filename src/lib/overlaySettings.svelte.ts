// Overlay settings. localStorage is shared by the main window and the overlay window (same origin),
// the Rust side gets "enabled" / "record" so it doesn't capture the screen when the overlay is off.
import { invoke } from "@tauri-apps/api/core";

// What "Лучший выбор" is picked by. "collection" needs the inventory (waiting for DE), not selectable yet.
export type Priority = "platinum" | "ducats" | "collection";

export interface OverlaySettings {
  enabled: boolean;
  priority: Priority;
  record: boolean; // debug: save screen recordings and scan frames
}

const KEY = "dwc.overlay";
const DEFAULTS: OverlaySettings = { enabled: true, priority: "platinum", record: false };

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
  }
}

export const overlaySettings = new Store();
