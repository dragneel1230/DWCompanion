// Interface scale (Settings → app): the webview's zoom, like Ctrl+wheel in a browser, so layout and
// tooltips stay right. "auto" enlarges only on 4K-class screens (a 4K monitor at 100-150% Windows scaling
// leaves the app tiny): logical width / 1920, up to 2x. Applied in the main window and the hub; the reward
// overlay keeps 1x (it maps screen pixels). Every window follows a change through the storage event.
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { currentMonitor } from "@tauri-apps/api/window";

export type UiScale = "auto" | number;
export const UI_SCALES: UiScale[] = ["auto", 1, 1.25, 1.5, 1.75, 2];

const KEY = "dwc.uiScale";

function read(): UiScale {
  try {
    const v = localStorage.getItem(KEY);
    if (!v || v === "auto") return "auto";
    const n = Number(v);
    return n >= 0.5 && n <= 3 ? n : "auto";
  } catch {
    return "auto";
  }
}

async function autoFactor(): Promise<number> {
  const m = await currentMonitor().catch(() => null);
  if (!m || m.size.width < 3600) return 1;
  const logical = m.size.width / m.scaleFactor;
  return Math.min(2, Math.max(1, Math.round((logical / 1920) * 4) / 4));
}

class Store {
  value = $state<UiScale>(read());
  factor = $state(1); // applied zoom

  set(v: UiScale) {
    this.value = v;
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      // storage unavailable: lasts for this session
    }
    void this.apply();
  }

  async apply() {
    const f = this.value === "auto" ? await autoFactor() : this.value;
    this.factor = f;
    await getCurrentWebview().setZoom(f).catch(() => {});
  }

  start() {
    void this.apply();
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      this.value = read();
      void this.apply();
    });
  }
}

export const uiScale = new Store();
