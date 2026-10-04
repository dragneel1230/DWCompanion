// Shared bits of the hub (overlay opened by a hotkey over the game).
import type { EntryKind } from "$lib/db";
import { labels } from "$lib/i18n/index.svelte";

// What the detail panel shows; the hub keeps a stack of them (item -> its relic -> ...).
export interface View {
  kind: EntryKind | "baro"; // baro: Baro Ki'Teer's stock (Baro.svelte)
  id: string;
}

// Mission state from EE.log (reward.rs, "mission-state" event / mission_state command).
export interface Mission {
  active: boolean;
  name: string | null; // "Martialis (Марс) - Разрыв: Лит"
  node: string | null; // "SolNode763" when joined in progress
  relics: string[]; // "T1VoidProjectionProteaPrimeAPlatinum"
  my_relic: string | null; // the relic the player took: "Реликвия Лит P9 [СИЯЮЩАЯ]"
  lobby: Lobby | null; // mission picked on the ship, not started yet
}

export interface Lobby {
  tier: string | null; // "VoidT1" for a fissure
  node: string | null;
  name: string | null; // "Martialis (Марс) - Разрыв: Лит"
}

// Page of the main window for "Открыть в приложении".
export function appPath(v: View): string {
  if (v.kind === "baro") return "/time";
  if (v.kind === "craft") return `/resources?craft=${encodeURIComponent(v.id)}`;
  const route = v.kind === "mod" || v.kind === "arcane" ? "market" : v.kind === "resource" ? "resources" : v.kind;
  return `/${route}?id=${encodeURIComponent(v.id)}`;
}

// Relic refinement from the projection's suffix (no suffix = intact).
const REFINE: Record<string, string> = labels({ Bronze: "refine.intact", Silver: "refine.exceptional", Gold: "refine.flawless", Platinum: "refine.radiant" });
export function refinement(projection: string): string {
  return REFINE[projection.match(/(Bronze|Silver|Gold|Platinum)$/)?.[1] ?? "Bronze"];
}

// Fissure tier colors, Lith..Omnia (tierNum 1..6).
export const TIER_COLOR = ["", "#c69a6d", "#b9c2cf", "#dcc373", "#efe0b0", "#d46a5f", "#a08cff"];
