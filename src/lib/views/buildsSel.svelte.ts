// «Билды»: the open tab (warframes or a kind of gear) and the picked item and build in each,
// one choice for the app and the hub (localStorage is shared).
import type { GearTab } from "$lib/gear";

const KEY = "dwc.buildsSel";

export type BuildsTab = "frame" | GearTab;

interface Sel {
  tab: BuildsTab;
  frame: string;
  build: string;
  item: Partial<Record<GearTab, string>>;
  gbuild: string;
}

function load(): Sel {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      tab: typeof s?.tab === "string" ? s.tab : "frame",
      frame: typeof s?.frame === "string" ? s.frame : "",
      build: typeof s?.build === "string" ? s.build : "",
      item: s?.item && typeof s.item === "object" ? s.item : {},
      gbuild: typeof s?.gbuild === "string" ? s.gbuild : "",
    };
  } catch {
    return { tab: "frame", frame: "", build: "", item: {}, gbuild: "" };
  }
}

export const buildsSel = $state(load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(buildsSel));
  } catch {
    // storage unavailable
  }
}

export function setBuildsTab(tab: BuildsTab) {
  buildsSel.tab = tab;
  save();
}

export function pickBuild(frame: string, build = "") {
  buildsSel.tab = "frame";
  buildsSel.frame = frame;
  buildsSel.build = build;
  save();
}

export function pickGear(kind: GearTab, item: string, build = "") {
  buildsSel.tab = kind;
  buildsSel.item = { ...buildsSel.item, [kind]: item };
  buildsSel.gbuild = build;
  save();
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    Object.assign(buildsSel, load());
  });
