// UI state of the hub tabs that should survive closing the hub (its content unmounts when hidden).
// «Добыча» keeps its own (src/lib/views/farmState.svelte.ts), shared with the app's page.
export type HubTab = "now" | "goals" | "builds" | "relics" | "trade" | "resources" | "collection";
const TABS: HubTab[] = ["now", "goals", "builds", "relics", "trade", "resources", "collection"];
// Tabs of earlier versions -> where their content lives now.
const OLD: Record<string, HubTab> = { overview: "now", time: "now", market: "trade", orders: "trade" };

const KEY = "dwc.hub.tabs";

function load(): HubTab {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s) return TABS.includes(s.tab) ? s.tab : (OLD[s.tab] ?? "now");
  } catch {
    // storage unavailable
  }
  return "now";
}

export const tabs = $state({
  tab: load(),
  marketQuery: "",
});

export function saveTabs() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tab: tabs.tab }));
  } catch {
    // storage unavailable
  }
}
