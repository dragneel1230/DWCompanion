// UI state of the hub tabs that should survive closing the hub (its content unmounts when hidden).
export type HubTab = "overview" | "resources" | "market" | "time" | "collection";
export type ResMode = "here" | "all" | "craft";
export type ResPick = { kind: "res" | "craft"; id: string };

const KEY = "dwc.hub.tabs";

function load(): { tab: HubTab; resMode: ResMode } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return { tab: s.tab ?? "overview", resMode: s.resMode ?? "here" };
  } catch {
    // storage unavailable
  }
  return { tab: "overview", resMode: "here" };
}

const saved = load();

export const tabs = $state({
  tab: saved.tab,
  resMode: saved.resMode,
  resQuery: "",
  resPlanet: null as string | null, // planet picked by hand in "Здесь" (no mission)
  resStack: [] as ResPick[],
  craftKind: "all" as string,
  marketQuery: "",
});

export function saveTabs() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tab: tabs.tab, resMode: tabs.resMode }));
  } catch {
    // storage unavailable
  }
}
