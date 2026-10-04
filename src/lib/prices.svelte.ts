// Reactive prices shared by a window's components: ask for slugs, read `sell[slug]` (undefined =
// loading, null = nobody sells). Prime parts and sets come at once from the bulk file (api.ts
// loadBulk, the day's average); anything else — relics, mods — through the live queue (~3/s).
import { getPrice, cachedPrice, loadBulk, bulkSell } from "$lib/api";

class Prices {
  sell = $state<Record<string, number | null | undefined>>({});

  want(slugs: (string | undefined)[]) {
    const todo = slugs.filter((s): s is string => !!s && !(s in this.sell));
    for (const s of todo) this.sell[s] = undefined;
    if (!todo.length) return;
    loadBulk().then(() => {
      for (const slug of todo) {
        const b = bulkSell(slug);
        if (b != null) {
          this.sell[slug] = b;
          continue;
        }
        const c = cachedPrice(slug);
        if (c) {
          this.sell[slug] = c.sell;
          continue;
        }
        getPrice(slug)
          .then((p) => (this.sell[slug] = p?.sell ?? null))
          .catch(() => (this.sell[slug] = null));
      }
    });
  }
}

export const prices = new Prices();
