<script lang="ts">
  // «Реликвии» (app page and hub tab): the relic loop in one place — what I hold (open or sell), what is
  // worth farming now, and what the opened ones gave (journal from EE.log). Only "Мои" needs the inventory.
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { getDb } from "$lib/db";
  import { invView } from "$lib/inv/invView.svelte";
  import { journal, startOfDay, DAY } from "$lib/journal.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import InvBar from "$lib/inv/InvBar.svelte";
  import InvRelics from "$lib/inv/InvRelics.svelte";
  import InvFarm from "$lib/inv/InvFarm.svelte";
  import Journal from "$lib/relics/Journal.svelte";
  import { subs, setRelics, type RelicsSub } from "./sub.svelte";

  let { compact = false }: { compact?: boolean } = $props();

  invView.start();
  journal.start();
  const inv = $derived(inventory.data);
  const kpi = $derived(invView.kpi);
  const ERAS = ["Lith", "Meso", "Neo", "Axi", "Requiem"];
  // Era names as the game writes them ("Лит" / "Lith"): the first word of a relic's short name.
  const ERA_NAME: Record<string, string> = Object.fromEntries(Object.values(getDb().relics).map((r) => [r.era, r.s.split(" ")[0]]));

  const SUBS: { id: RelicsSub; label: Key; inv?: boolean }[] = [
    { id: "mine", label: "relics.mine", inv: true },
    { id: "farm", label: "inv.tab.farm" },
    { id: "journal", label: "nav.journal" },
  ];
  const sub = $derived(!inv && subs.relics === "mine" ? "farm" : subs.relics);
  const week = $derived(journal.list.filter((e) => e.t >= startOfDay(Date.now()) - 6 * DAY).length);
</script>

<div class="section" class:compact>
  <InvBar title="nav.relics" lead="relics.lead" {compact}>
    {#if inv}
      <div class="kpi main">
        <small>{t("inv.kpi.relics", { n: kpi.relics })}</small>
        <b><Cur kind="plat" value={Math.round(kpi.relicsEv)} size={compact ? 15 : 20} /></b>
        <i>{t("inv.kpi.relicsHint")}</i>
      </div>
      <div class="kpi">
        <small>{t("relics.byEra")}</small>
        <span class="eras">
          {#each ERAS as e (e)}{#if invView.byEra[e]}<span><em>{ERA_NAME[e] ?? e}</em> {invView.byEra[e]}</span>{/if}{/each}
        </span>
      </div>
      <div class="kpi">
        <small>{t("relics.week")}</small>
        <b>{week}</b>
        <i>{t("relics.weekHint")}</i>
      </div>
    {/if}
  </InvBar>

  <nav class="seg subs">
    {#each SUBS as x (x.id)}
      <button class:on={sub === x.id} disabled={x.inv && !inv} onclick={() => setRelics(x.id)}>{t(x.label)}</button>
    {/each}
  </nav>

  {#if sub === "journal"}
    <Journal />
  {:else if !invView.ctx}
    <p class="muted">{t("coll.loading")}</p>
  {:else if sub === "mine"}
    <InvRelics stacks={invView.stacks} />
  {:else}
    <InvFarm relics={invView.farm} drops={invView.ctx.drops} />
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
  .eras {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }
  .eras em {
    font-style: normal;
    color: var(--text-faint);
  }
</style>
