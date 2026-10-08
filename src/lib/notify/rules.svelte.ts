// Notification filters (Settings → «Уведомления»): the player's rules plus built-in switches. Kept in
// localStorage `dwc.notify`, shared by the windows; only the main window checks them (watch.svelte.ts).
export type RuleKind = "fissure" | "invasion" | "alert" | "baro" | "cycle" | "price";
export type FissureMode = "any" | "normal" | "hard" | "storm";
// Open-world state a cycle rule waits for: "<place>-<state>" as cycles.ts names them.
export type CycleTarget = "earth-day" | "earth-night" | "cetus-day" | "cetus-night" | "vallis-warm" | "vallis-cold" | "cambion-fass" | "cambion-vome";
export const CYCLE_TARGETS: CycleTarget[] = ["cetus-night", "cetus-day", "vallis-warm", "vallis-cold", "cambion-fass", "cambion-vome", "earth-day", "earth-night"];

export interface Rule {
  id: string;
  on: boolean;
  kind: RuleKind;
  tiers?: number[]; // fissure: 1..6 (Lith..Omnia), empty = any
  missions?: string[]; // fissure: MT_* codes, empty = any
  mode?: FissureMode; // fissure
  text?: string; // invasion / alert / baro: words, comma separated, any of them (baro: empty = his arrival)
  cycle?: CycleTarget; // cycle
  before?: number; // cycle: minutes ahead, 0 = when it starts
  slug?: string; // price: warframe.market item
  name?: string; // price: shown name
  below?: number; // price: platinum, cheapest online seller at or under it
}

export interface NotifySettings {
  foundry: boolean; // «Литейная»: a blueprint is ready
  quiet: boolean; // hold notifications during a mission (EE.log): they come when back on the ship
  rules: Rule[];
}

const KEY = "dwc.notify";
const DEFAULT: NotifySettings = { foundry: true, quiet: true, rules: [] };

function load(): NotifySettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && Array.isArray(s.rules)) return { ...DEFAULT, ...s };
  } catch {
    // storage unavailable or broken
  }
  return { ...DEFAULT, rules: [] };
}

class Notify {
  value = $state<NotifySettings>(load());

  constructor() {
    window.addEventListener("storage", (e) => e.key === KEY && (this.value = load()));
  }
  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage unavailable
    }
  }
  set(p: Partial<Omit<NotifySettings, "rules">>) {
    this.value = { ...this.value, ...p };
    this.#save();
  }
  add(kind: RuleKind): Rule {
    const r: Rule = { id: Math.random().toString(36).slice(2, 10), on: true, kind, ...FRESH[kind] };
    this.value = { ...this.value, rules: [...this.value.rules, r] };
    this.#save();
    return r;
  }
  update(id: string, p: Partial<Rule>) {
    this.value = { ...this.value, rules: this.value.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) };
    this.#save();
  }
  remove(id: string) {
    this.value = { ...this.value, rules: this.value.rules.filter((r) => r.id !== id) };
    this.#save();
  }
}

const FRESH: Record<RuleKind, Partial<Rule>> = {
  fissure: { tiers: [], missions: [], mode: "any" },
  invasion: { text: "" },
  alert: { text: "" },
  baro: { text: "" },
  cycle: { cycle: "cetus-night", before: 5 },
  price: { slug: "", name: "", below: 10 },
};

export const notify = new Notify();
