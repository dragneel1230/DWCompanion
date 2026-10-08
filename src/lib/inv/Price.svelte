<script lang="ts">
  // One market price: platinum, how it was measured (deals / asks), the trend and how fast it sells.
  import { num, t } from "$lib/i18n/index.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import type { DayPrice } from "$lib/marketDay";
  import { speedOf } from "./worth";

  let { p, speed = true }: { p: DayPrice | null; speed?: boolean } = $props();
  const sp = $derived(p ? speedOf(p.deals) : "rare");
  const DOTS = { fast: 3, ok: 2, slow: 1, rare: 0 };
</script>

{#if p}
  <span class="price" title={p.basis === "deals" ? t("inv.price.deals", { n: p.deals }) : t("inv.price.asks")}>
    <Cur kind="plat" value={p.price} size={14} />
    {#if p.basis === "asks"}<i class="asks">{t("inv.price.asksShort")}</i>{/if}
    {#if p.trend != null && Math.abs(p.trend) >= 0.08}
      <i class="trend" class:up={p.trend > 0}>{p.trend > 0 ? "▲" : "▼"}{num(Math.round(Math.abs(p.trend) * 100))}%</i>
    {/if}
  </span>
  {#if speed}
    <span class="speed {sp}" title={t("inv.price.deals", { n: p.deals })}>
      {#each [0, 1, 2] as i (i)}<b class:on={i < DOTS[sp]}></b>{/each}
      <small>{t(`inv.speed.${sp}`)}</small>
    </span>
  {/if}
{:else}
  <span class="none" title={t("inv.price.none")}>—</span>
{/if}

<style>
  .price {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .asks {
    font-style: normal;
    font-size: 10px;
    color: var(--text-faint);
    border: 1px dashed var(--line);
    border-radius: 4px;
    padding: 0 3px;
  }
  .trend {
    font-style: normal;
    font-size: 10px;
    color: var(--warn);
  }
  .trend.up {
    color: var(--good);
  }
  .speed {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .speed b {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
  }
  .speed.fast b.on {
    background: var(--good);
  }
  .speed.ok b.on {
    background: var(--accent);
  }
  .speed.slow b.on {
    background: var(--warn);
  }
  .speed small {
    margin-left: 4px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .none {
    color: var(--text-faint);
  }
</style>
