// What the inventory sections compute from the snapshot, shared by the app pages and the hub tabs
// ("Торговля", "Реликвии", "Сейчас"): names, yesterday's prices, rows to sell, sets, relic stacks.
import { inventory } from "$lib/inventory.svelte";
import { loadMarketDay, marketDate } from "$lib/marketDay";
import { goals } from "$lib/goals/goals.svelte";
import { wfm } from "$lib/wfm.svelte";
import { loadInvCtx, type InvCtx } from "./ctx";
import { farmRelics, realValue, relicStacks, setRows, tradeRows, type RelicStack } from "./worth";

const stackEv = (s: RelicStack) => Object.entries(s.counts).reduce((n, [f, c]) => n + (c ?? 0) * s.ev[f as keyof RelicStack["ev"]], 0);

class InvView {
  ctx = $state<InvCtx | null>(null);
  priced = $state(0); // bumps when yesterday's prices arrive
  #started = false;

  start() {
    if (this.#started) return;
    this.#started = true;
    loadInvCtx().then((c) => (this.ctx = c));
    loadMarketDay().then(() => this.priced++);
    if (!wfm.checked) void wfm.check();
  }

  mdate = $derived((void this.priced, marketDate()));
  goalIds = $derived(new Set(goals.list.map((g) => g.id)));
  trade = $derived.by(() =>
    (void this.priced, this.ctx && inventory.data ? tradeRows(inventory.data, this.ctx.frames, this.ctx.other, this.goalIds, inventory.prefs) : []),
  );
  sets = $derived.by(() => (void this.priced, inventory.data ? setRows(inventory.data, this.goalIds) : []));
  stacks = $derived.by(() => (void this.priced, inventory.data ? relicStacks(inventory.data, this.goalIds) : []));
  farm = $derived.by(() => (void this.priced, this.ctx ? farmRelics(inventory.data, this.goalIds) : []));

  // The player's sell orders by market slug.
  orders = $derived.by(() => {
    const slugOf = new Map([...(this.ctx?.wfmId ?? [])].map(([slug, id]) => [id, slug]));
    const m = new Map<string, { qty: number; price: number }>();
    for (const o of wfm.orders) if (o.type === "sell" && slugOf.has(o.itemId)) m.set(slugOf.get(o.itemId)!, { qty: o.quantity, price: o.platinum });
    return m;
  });

  kpi = $derived({
    spare: this.trade.reduce((s, r) => s + realValue(r, r.spare), 0),
    spareDucats: this.trade.reduce((s, r) => s + r.spare * r.ducats, 0),
    all: this.trade.reduce((s, r) => s + realValue(r, r.count), 0),
    relics: this.stacks.reduce((s, x) => s + x.total, 0),
    relicsEv: this.stacks.reduce((s, x) => s + stackEv(x), 0),
    readySets: this.sets.filter((r) => r.full > 0).length,
  });

  // Relics owned per era ("Lith" -> 37), for fissures: what the player can open right now.
  byEra = $derived.by(() => {
    const m: Record<string, number> = {};
    for (const s of this.stacks) if (s.relic.era) m[s.relic.era] = (m[s.relic.era] ?? 0) + s.total;
    return m;
  });
}

export const invView = new InvView();
