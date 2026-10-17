import type { Db } from "$lib/db";
import type { InvData } from "$lib/inventory.svelte";

export type RelicCoverage = "none" | "relics" | "parts";

// Match each missing copy to a distinct owned relic. Alternative rewards share the same relic stock.
export function relicCoverage(db: Db, id: string, inv: InvData | null, held: Map<string, number>): RelicCoverage {
  const set = db.sets[id];
  if (!inv || !set?.parts.length) return "none";
  const needed = new Map<string, number>();
  for (const part of set.parts) needed.set(part, (needed.get(part) ?? 0) + 1);
  const missing: string[] = [];
  for (const [part, count] of needed) {
    const built = part.endsWith("Blueprint") ? (inv.items[part.replace(/Blueprint$/, "Component")] ?? 0) : 0;
    for (let n = (inv.items[part] ?? 0) + built; n < count; n++) missing.push(part);
  }
  if (!missing.length) return "parts";
  const choices = missing.map(part => new Set((db.items[part]?.relics ?? []).map(r => r.relic)));
  const keys = [...held].filter(([key, count]) => count > 0 && choices.some(c => c.has(key)))
    .flatMap(([key, count]) => Array.from({ length: Math.min(count, missing.length) }, () => key));
  if (keys.length < missing.length) return "none";
  const assigned = new Map<number, number>();
  function match(part: number, visited: Set<number>): boolean {
    for (let slot = 0; slot < keys.length; slot++) {
      if (visited.has(slot) || !choices[part].has(keys[slot])) continue;
      visited.add(slot);
      const previous = assigned.get(slot);
      if (previous == null || match(previous, visited)) {
        assigned.set(slot, part);
        return true;
      }
    }
    return false;
  }
  return missing.every((_, i) => match(i, new Set())) ? "relics" : "none";
}
