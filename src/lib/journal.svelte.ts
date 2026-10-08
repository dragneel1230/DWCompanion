// Relic journal on the app side: entries come from Rust (journal.rs, EE.log), resolved here to our
// database (relic key, refinement, reward item, mission name) and kept live through events.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getDb, nodeOfMission, type Item } from "$lib/db";
import { parseRelicText, type Refine } from "$lib/relicValue";
import { t } from "$lib/i18n/index.svelte";

export interface Opening {
  id: string;
  t: number;
  mission: string | null;
  node?: string;
  tier?: string;
  relic: string | null;
  reward: string;
  offer?: string[];
  picked?: string;
  pick_by?: "inv" | "hand"; // who marked the pick: the inventory after the mission, or the player
}

export interface Entry extends Opening {
  relicKey: string | null;
  refine: Refine;
  item: Item | null;
  place: string; // "Martialis (Марс)"
  kind: string; // "Разрыв: Лит"
  got: string; // what counts as received: the marked pick, else the own relic's reward
}

export function resolve(o: Opening): Entry {
  const db = getDb();
  const { key, refine } = o.relic ? parseRelicText(o.relic) : { key: null, refine: "intact" as Refine };
  let place = "";
  let kind = "";
  // The node's name in the interface language when known; the client's text (EE.log) otherwise.
  const node = o.node ?? nodeOfMission(o.mission);
  if (o.mission) {
    const i = o.mission.lastIndexOf(" - ");
    [place, kind] = i > 0 ? [o.mission.slice(0, i), o.mission.slice(i + 3)] : [o.mission, ""];
  }
  if (node && db.world.regions[node]) place = db.world.regions[node].n;
  if (o.tier) kind = t("journal.fissure", { tier: db.world.tier[o.tier] ?? o.tier });
  const got = o.picked ?? o.reward;
  return { ...o, relicKey: key, refine, item: db.items[got] ?? null, place: place || t("journal.mission"), kind, got };
}

class Journal {
  list = $state<Entry[]>([]);
  loaded = $state(false);
  #started = false;

  start() {
    if (this.#started) return;
    this.#started = true;
    invoke<Opening[]>("journal_list")
      .then((l) => {
        this.list = l.map(resolve).sort((a, b) => b.t - a.t);
        this.loaded = true;
      })
      .catch(() => (this.loaded = true));
    listen<Opening>("journal-new", (e) => (this.list = [resolve(e.payload), ...this.list]));
    listen<Opening>("journal-update", (e) => (this.list = this.list.map((x) => (x.id === e.payload.id ? resolve(e.payload) : x))));
    listen<string>("journal-deleted", (e) => (this.list = this.list.filter((x) => x.id !== e.payload)));
  }

  // offer: the cards corrected by what actually arrived (the inventory caught an OCR misread).
  pick(id: string, item: string | null, by: "inv" | "hand" = "hand", offer?: string[]) {
    invoke("journal_pick", { id, item, by, offer: offer ?? null }).catch(() => {});
  }
  remove(id: string) {
    invoke("journal_delete", { id }).catch(() => {});
  }
}

export const journal = new Journal();

// Periods for the summary.
export const DAY = 86_400_000;
export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
