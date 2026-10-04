// Hub (overlay opened by a hotkey) settings. Saved in localStorage by the main window; the hotkey is
// registered on the Rust side (hub_set_shortcut), which falls back to the default if it is taken.
import { invoke } from "@tauri-apps/api/core";

export interface HubSettings {
  shortcut: string; // Tauri accelerator: "Alt+X", "Ctrl+Shift+F1"...
}

const KEY = "dwc.hub";
export const DEFAULT_SHORTCUT = "Alt+X";
const DEFAULTS: HubSettings = { shortcut: DEFAULT_SHORTCUT };

export function readHubSettings(): HubSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

// "Alt+X" -> ["Alt", "X"] for key caps.
export const shortcutKeys = (s: string) => s.split("+").map((k) => (k === "Backquote" ? "`" : k));

const LONE_KEYS = ["Home", "End", "Insert", "PageUp", "PageDown", "Pause", "ScrollLock"];

// A key press -> accelerator, or null while only modifiers are held.
// A bare key only for F1..F24 and Home/End-like keys (a plain letter would be taken from the game).
export function acceleratorOf(e: KeyboardEvent): string | null {
  const code = e.code;
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === "Backquote") key = "Backquote";
  else if (LONE_KEYS.includes(code)) key = code;
  if (!key) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  if (!mods.length && !/^F\d/.test(key) && !LONE_KEYS.includes(key)) return null;
  return [...mods, key].join("+");
}

class Store {
  value = $state<HubSettings>(readHubSettings());
  error = $state("");

  async set(patch: Partial<HubSettings>) {
    const next = { ...this.value, ...patch };
    try {
      await invoke("hub_set_shortcut", { accel: next.shortcut });
      this.error = "";
    } catch (e) {
      this.error = String(e);
      return;
    }
    this.value = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage unavailable: lasts for this session
    }
  }

  sync() {
    invoke("hub_set_shortcut", { accel: this.value.shortcut }).catch((e) => (this.error = String(e)));
  }
}

export const hubSettings = new Store();
