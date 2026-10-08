// How the "Orders" tab suggests prices (localStorage, shared by the app and the hub).
import type { Settings } from "./market.svelte";

const KEY = "dwc.tradeSettings";
const DEFAULT: Settings = { step: 1, online: false, floor: 0.8 };

function read(): Settings {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT };
  }
}

class TradeSettings {
  v = $state<Settings>(read());

  constructor() {
    window.addEventListener("storage", (e) => e.key === KEY && (this.v = read()));
  }

  set(patch: Partial<Settings>) {
    this.v = { ...this.v, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.v));
    } catch {
      // storage unavailable
    }
  }
}

export const tradeSettings = new TradeSettings();
