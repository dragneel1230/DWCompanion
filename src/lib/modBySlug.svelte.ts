// Mods and arcanes by warframe.market slug: market lists (orders, the new-order search) draw them in
// their game frames instead of the site's thumbnail, and link to their page. Loaded on first use.
import { loadFrames, loadOtherMods, type Arcane, type Mod } from "$lib/frames";

let mods = $state<Map<string, [string, Mod]>>(new Map());
let arcanes = $state<Map<string, [string, Arcane]>>(new Map());
let started = false;

function start() {
  if (started) return;
  started = true;
  Promise.all([loadFrames(), loadOtherMods().catch(() => ({}) as Record<string, Mod>)])
    .then(([f, other]) => {
      const m = new Map<string, [string, Mod]>();
      for (const [id, x] of [...Object.entries(other), ...Object.entries(f.mods)])
        if (x.slug && (!m.has(x.slug) || x.max > m.get(x.slug)![1].max)) m.set(x.slug, [id, x]);
      mods = m;
      arcanes = new Map(Object.entries(f.arcanes).filter(([, a]) => a.slug).map(([id, a]) => [a.slug!, [id, a]]));
    })
    .catch(() => (started = false));
}

export function cardBySlug(slug: string | undefined): { id?: string; mod?: Mod; arcane?: Arcane } {
  start();
  if (!slug) return {};
  const m = mods.get(slug);
  if (m) return { id: m[0], mod: m[1] };
  const a = arcanes.get(slug);
  return a ? { id: a[0], arcane: a[1] } : {};
}
