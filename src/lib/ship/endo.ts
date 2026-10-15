// «Растворить»: spare unranked mods -> Endo. Only unranked copies (RawUpgrades): those are what the game's
// Quick Select takes, and their yield is exact. Yield by rarity: wiki "Mod" (Dissolution table, rank 0):
// bronze 5, silver / peculiar 10, gold / amalgam 15, platinum (primed) 20. Requiem mods and Rivens have their
// own rules: left out. Copies to keep: the same setting as «Торговля» → «Продать» (inventory prefs).
import type { InvData } from "$lib/inventory.svelte";
import type { Prefs } from "$lib/inv/worth";
import type { Mod, ModRarity } from "$lib/frames";
import { dayPrice, type DayPrice } from "$lib/marketDay";

const R0: Record<ModRarity, number> = { Common: 5, Uncommon: 10, Peculiar: 10, Rare: 15, Legendary: 20 };

export interface DissolveRow {
  id: string;
  mod: Mod;
  spare: number; // unranked copies past what you keep
  each: number; // Endo per copy
  total: number;
  price: DayPrice | null; // one unranked copy on warframe.market yesterday; null: not traded / no data
}

export function dissolveRows(inv: InvData, mods: Record<string, Mod>, p: Prefs): DissolveRow[] {
  const out: DissolveRow[] = [];
  for (const [id, raw] of Object.entries(inv.rawMods ?? {})) {
    const mod = mods[id];
    if (!mod || mod.fr === "Riven" || /\/Mods\/Immortal\//.test(id)) continue;
    const each = R0[mod.rarity];
    if (!each) continue;
    // Ranked copies count toward what you keep first: an unranked spare is free to go.
    const ranked = Math.max(0, (inv.mods[id]?.[0] ?? raw) - raw);
    const keep = Math.max(0, p.keepCopies - ranked);
    const spare = raw - Math.min(raw, keep);
    if (spare > 0) out.push({ id, mod, spare, each, total: spare * each, price: mod.slug ? dayPrice(mod.slug, 0) : null });
  }
  return out;
}
