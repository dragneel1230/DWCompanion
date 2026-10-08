<script lang="ts">
  // «Орбитер» (app page and hub tab): the ship's own machines from the inventory snapshot — the foundry
  // (what builds, what can be started) and Helminth (rank, secretions, subsumes, Invigorations).
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import InvBar from "$lib/inv/InvBar.svelte";
  import Foundry from "$lib/ship/Foundry.svelte";
  import Helminth from "$lib/ship/Helminth.svelte";
  import { rankOf } from "$lib/ship/helminth";
  import { subs, setShip, type ShipSub } from "./sub.svelte";

  let { compact = false }: { compact?: boolean } = $props();

  const inv = $derived(inventory.data);
  const SUBS: { id: ShipSub; label: Key }[] = [
    { id: "foundry", label: "ship.foundry" },
    { id: "helminth", label: "ship.helminth" },
  ];

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const pending = $derived(inv?.foundry ?? []);
  const ready = $derived(pending.filter((f) => f.done <= now).length);
  const next = $derived(pending.filter((f) => f.done > now).sort((a, b) => a.done - b.done)[0]);
  const rank = $derived(inv?.helminth ? rankOf(inv.helminth.xp).rank : null);
  const nextIn = (ms: number) => {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    return m < 60 ? t("unit.minutes", { v: m }) : t("unit.hm", { h: Math.floor(m / 60), m: m % 60 });
  };
</script>

<div class="section" class:compact>
  <InvBar title="nav.ship" lead="ship.lead" {compact}>
    {#if inv}
      <div class="kpi main">
        <small>{t("ship.kpi.building")}</small>
        <b>{pending.length}</b>
        <i>{ready ? t("ship.kpi.ready", { n: ready }) : next ? t("ship.kpi.next", { v: nextIn(next.done - now) }) : t("ship.kpi.idle")}</i>
      </div>
      {#if rank !== null}
        <div class="kpi">
          <small>{t("ship.helminth")}</small>
          <b>{t("helm.rankShort", { r: rank })}</b>
          <i>{t("helm.fedShort", { n: inv.helminth?.fed.length ?? 0 })}</i>
        </div>
      {/if}
    {/if}
  </InvBar>

  <nav class="seg subs">
    {#each SUBS as x (x.id)}
      <button class:on={subs.ship === x.id} onclick={() => setShip(x.id)}>{t(x.label)}</button>
    {/each}
  </nav>

  {#if subs.ship === "helminth"}
    <Helminth {compact} />
  {:else}
    <Foundry {compact} />
  {/if}
</div>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .subs {
    align-self: flex-start;
  }
</style>
