// «Добыча» list state that should outlive the view (the hub unmounts its content when hidden):
// mode (search / here), the query and filters, and in the hub the stack of opened entries.
import type { FarmKind } from "$lib/farm";

export type FarmMode = "find" | "here";
export type FarmSel = { kind: "resource" | "craft" | "prime"; id: string };

const KEY = "dwc.farm.mode";
function loadMode(): FarmMode {
  try {
    return localStorage.getItem(KEY) === "here" ? "here" : "find";
  } catch {
    return "find";
  }
}

export const farmState = $state({
  mode: loadMode(),
  query: "",
  kind: null as FarmKind | null,
  planet: "", // planet filter of the resource list
  herePlanet: null as string | null, // planet picked by hand in "Здесь" (instead of the mission's)
  stack: [] as FarmSel[], // hub: opened entries (the app keeps them in the URL)
});

export function setFarmMode(m: FarmMode) {
  farmState.mode = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // storage unavailable
  }
}
