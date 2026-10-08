// App-wide settings (main window, localStorage): what closing the main window does. Applied on the Rust
// side (app_prefs.rs) at start and on change; the tray menu gets its labels in the interface language.
import { invoke } from "@tauri-apps/api/core";
import { t } from "$lib/i18n/index.svelte";

export interface AppSettings {
  tray: boolean; // closing the main window hides it to the tray (the overlay hotkey keeps working)
}

const KEY = "dwc.app";
const DEFAULTS: AppSettings = { tray: false };

function read(): AppSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

class Store {
  value = $state<AppSettings>(read());

  set(patch: Partial<AppSettings>) {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage unavailable: lasts for this session
    }
    this.sync();
  }

  sync() {
    invoke("app_set_prefs", { tray: this.value.tray, open: t("tray.open"), quit: t("tray.quit") }).catch(() => {});
  }
}

export const appSettings = new Store();
