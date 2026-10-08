<script lang="ts">
  // «Торговля» (app page and hub tab): everything about turning items into platinum in one place.
  // Sell / Sets / Changes come from the inventory snapshot; Market (prime sets and parts by yesterday's
  // deals) and Orders (the warframe.market desk) work without it.
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { invView } from "$lib/inv/invView.svelte";
  import type { View } from "$lib/hub/hub";
  import Cur from "$lib/components/Cur.svelte";
  import InvBar from "$lib/inv/InvBar.svelte";
  import InvSell from "$lib/inv/InvSell.svelte";
  import InvSets from "$lib/inv/InvSets.svelte";
  import InvLog from "$lib/inv/InvLog.svelte";
  import Market from "$lib/hub/Market.svelte";
  import Orders from "$lib/trade/Orders.svelte";
  import { subs, setTrade, type TradeSub } from "./sub.svelte";

  let { compact = false, onopen }: { compact?: boolean; onopen: (v: View) => void } = $props();

  invView.start();
  const inv = $derived(inventory.data);
  const kpi = $derived(invView.kpi);

  const SUBS: { id: TradeSub; label: Key; inv?: boolean }[] = [
    { id: "sell", label: "inv.tab.sell", inv: true },
    { id: "sets", label: "inv.tab.sets", inv: true },
    { id: "market", label: "hub.tab.market" },
    { id: "orders", label: "hub.tab.orders" },
    { id: "log", label: "inv.tab.log", inv: true },
  ];
  // Without a snapshot the inventory sub-tabs have nothing to show: open the market instead.
  const sub = $derived(!inv && SUBS.find((s) => s.id === subs.trade)?.inv ? "market" : subs.trade);

  let market = $state<Market>();
  let orders = $state<Orders>();
  export function dismiss(): boolean {
    if (sub === "market") return market?.dismiss() ?? false;
    if (sub === "orders") return orders?.dismiss() ?? false;
    return false;
  }

  // A "Выставить" button asked for a new order: the desk opens its form once.
  let initial = $state<typeof subs.newOrder>(null);
  $effect(() => {
    const n = subs.newOrder;
    if (!n) return;
    initial = n;
    subs.newOrder = null;
  });
</script>

<div class="section" class:compact>
  <InvBar title="nav.trade" lead="trade.lead" {compact}>
    {#if inv}
      <div class="kpi main">
        <small title={t("inv.kpi.spareHint")}>{t("inv.kpi.spare")}</small>
        <b><Cur kind="plat" value={Math.round(kpi.spare)} size={compact ? 15 : 20} /></b>
        {#if kpi.spareDucats}<i>{t("inv.orDucats")} <Cur kind="ducats" value={kpi.spareDucats} size={12} /></i>{/if}
      </div>
      <div class="kpi">
        <small>{t("inv.kpi.all")}</small>
        <b><Cur kind="plat" value={Math.round(kpi.all)} size={compact ? 13 : 16} /></b>
        <i>{t("inv.kpi.sets", { n: kpi.readySets })}</i>
      </div>
      <div class="kpi">
        <small>{t("inv.kpi.wallet")}</small>
        <span class="pair"><Cur kind="plat" value={inv.plat} size={13} /> <Cur kind="ducats" value={inv.ducats} size={13} /></span>
        <i>{num(inv.credits)} {t("inv.log.cr")}</i>
      </div>
    {/if}
  </InvBar>

  <nav class="seg subs">
    {#each SUBS as x (x.id)}
      <button class:on={sub === x.id} disabled={x.inv && !inv} onclick={() => setTrade(x.id)} title={x.inv && !inv ? t("trade.needInv") : undefined}>
        {t(x.label)}
        {#if x.id === "sets" && kpi.readySets}<i>{kpi.readySets}</i>{/if}
        {#if x.id === "log" && inventory.log.length}<i>{inventory.log.length}</i>{/if}
      </button>
    {/each}
  </nav>

  {#if sub === "market"}
    <div class="market-wrap"><Market bind:this={market} {onopen} /></div>
  {:else if sub === "orders"}
    {#key initial}
      <Orders bind:this={orders} {compact} initial={initial ?? null} />
    {/key}
  {:else if !invView.ctx}
    <p class="muted">{t("coll.loading")}</p>
  {:else if sub === "sell"}
    <InvSell rows={invView.trade} orders={invView.orders} />
  {:else if sub === "sets"}
    <InvSets rows={invView.sets} />
  {:else}
    <InvLog log={inventory.log} ctx={invView.ctx} />
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .section.compact {
    gap: 12px;
  }
  .subs {
    align-self: flex-start;
  }
  .subs button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .subs i {
    font-style: normal;
    margin-left: 5px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .market-wrap {
    height: 72vh;
    min-height: 420px;
  }
</style>
