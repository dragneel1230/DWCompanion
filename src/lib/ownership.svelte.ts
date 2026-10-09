// "Is it mine" for any item, one answer for the whole app: in the arsenal now (inventory), mastered (affinity from
// the profile or the inventory reached the item's max rank), how many of a resource / part / blueprint are held.
// null = unknown (no inventory snapshot / no profile, or not an item that levels).
import { inventory, bestXp } from "$lib/inventory.svelte";
import { profile } from "$lib/profile.svelte";
import { loadMastery, rankOf, type MasteryDb } from "$lib/mastery";

let mdb = $state<MasteryDb | null>(null);
let started = false;
function ensure() {
  if (started) return;
  started = true;
  loadMastery().then((m) => (mdb = m)).catch(() => {});
  profile.start();
}

export function isOwned(id: string): boolean | null {
  return inventory.data ? inventory.inArsenal(id) : null;
}

export function isMastered(id: string): boolean | null {
  ensure();
  const it = mdb?.items[id];
  if (!it) return null;
  const xp = bestXp(profile.data?.xp[id], id);
  if (xp == null) return profile.data || inventory.data ? false : null;
  return rankOf(xp, it.fl, it.max) >= it.max;
}

// Held count of a resource, part or blueprint; a component also counts its blueprint. null without a snapshot.
export function heldCount(id: string, bp?: string | null): number | null {
  if (!inventory.data) return null;
  return (inventory.count(id) ?? 0) + (bp ? (inventory.count(bp) ?? 0) : 0);
}
