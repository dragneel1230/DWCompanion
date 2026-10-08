// Shared bits of the hub (overlay opened by a hotkey over the game).
import type { EntryKind } from "$lib/db";
import { labels } from "$lib/i18n/index.svelte";

// What the detail panel shows; the hub keeps a stack of them (item -> its relic -> ...).
export interface View {
  kind: EntryKind | "baro" | "time"; // baro: Baro Ki'Teer's stock (Baro.svelte); time: every timer (Time.svelte)
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
  if (v.kind === "baro") return "/now?baro";
  if (v.kind === "time") return "/now?time";
  if (v.kind === "craft") return `/resources?craft=${encodeURIComponent(v.id)}`;
  const route = v.kind === "mod" || v.kind === "arcane" ? "market" : v.kind === "resource" ? "resources" : v.kind;
  return `/${route}?id=${encodeURIComponent(v.id)}`;
}

// The other way round: an app link (an <a href> inside a shared view) -> the hub's detail panel, or null
// when the hub has no panel for it (the hub then opens the page in the app).
const KINDS: Record<string, EntryKind> = { set: "set", item: "item", relic: "relic", frame: "frame" };
export function viewOf(href: string): View | null {
  const u = new URL(href, "http://x");
  const id = u.searchParams.get("id");
  const route = u.pathname.slice(1);
  if (route === "now" && u.searchParams.has("baro")) return { kind: "baro", id: "" };
  if (route === "now" && u.searchParams.has("time")) return { kind: "time", id: "" };
  const craft = u.searchParams.get("craft");
  if (route === "resources" && craft) return { kind: "craft", id: craft };
  if (!id) return null;
  // The builder (an existing build or a new one) lives in the app.
  if (route === "frame" && (u.searchParams.has("build") || u.searchParams.has("new"))) return null;
  if (KINDS[route]) return { kind: KINDS[route], id };
  if (route === "resources") return { kind: "resource", id };
  if (route === "market") return { kind: u.searchParams.get("k") === "arcane" ? "arcane" : "mod", id };
  return null;
}

// Relic refinement from the projection's suffix (no suffix = intact).
const REFINE: Record<string, string> = labels({ Bronze: "refine.intact", Silver: "refine.exceptional", Gold: "refine.flawless", Platinum: "refine.radiant" });
export function refinement(projection: string): string {
  return REFINE[projection.match(/(Bronze|Silver|Gold|Platinum)$/)?.[1] ?? "Bronze"];
}

// Fissure tier colors, Lith..Omnia (tierNum 1..6).
export const TIER_COLOR = ["", "#c69a6d", "#b9c2cf", "#dcc373", "#efe0b0", "#d46a5f", "#a08cff"];
