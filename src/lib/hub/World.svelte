<script lang="ts">
  // Open-world cycles, Baro and Prime Resurgence, compact.
  import { t } from "$lib/i18n/index.svelte";
  import { cycles, left, CYCLE_ICON } from "$lib/cycles";
  import type { View } from "./hub";
  import { world } from "./worldData.svelte";
  import Resurgence from "$lib/components/Resurgence.svelte";

  let { now, onopen }: { now: number; onopen: (v: View) => void } = $props();

  const timers = $derived(world.timers);
  const error = $derived(world.error);

  const list = $derived(cycles(now, timers?.cetusEnd ?? 0));
  const baroHere = $derived(!!timers?.baro && now >= timers.baro.from && now < timers.baro.to);
</script>

<section class="panel">
  <header><h2>{t("world.title")}</h2></header>
  <div class="body">
    {#each list as c (c.id)}
      <div class="cycle {c.kind}">
        <svg viewBox="0 0 24 24"><path d={CYCLE_ICON[c.kind]} /></svg>
        <span class="place">{c.place}<b>{c.state}</b></span>
        <span class="time">{left(c.ends - now)}</span>
      </div>
    {/each}

    {#if timers?.baro}
      {@const b = timers.baro}
      {#if baroHere && b.items?.length}
        <button class="event here" onclick={() => onopen({ kind: "baro", id: "" })}>
          <b>{t("world.baro")}</b>
          <span>{t("world.baroHere", { relay: b.relay, left: left(b.to - now) })}</span>
          <span class="more">{t("baro.show", { n: b.items.length })}</span>
        </button>
      {:else}
        <div class="event" class:here={baroHere}>
          <b>{t("world.baro")}</b>
          <span>{baroHere ? t("world.baroHere", { relay: b.relay, left: left(b.to - now) }) : t("world.baroComing", { relay: b.relay, left: left(b.from - now) })}</span>
        </div>
      {/if}
    {/if}
    {#if timers?.resurgence}
      {@const r = timers.resurgence}
      <div class="event">
        <Resurgence {r} {now} compact onpick={(id) => onopen({ kind: "set", id })} />
      </div>
    {/if}
    {#if error && !timers}
      <div class="empty"><span>{t("world.error", { error })}</span></div>
    {/if}
  </div>
</section>

<style>
  .cycle {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
  }
  svg {
    flex: none;
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .day svg {
    color: #f0c66b;
  }
  .night svg {
    color: #9fb4ff;
  }
  .warm svg {
    color: #ff9a5c;
  }
  .cold svg {
    color: #8fd8ff;
  }
  .fass svg {
    color: #e58a6a;
  }
  .vome svg {
    color: #7fc9b0;
  }
  .place {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 12px;
    color: var(--text-faint);
  }
  .place b {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
  .time {
    font-size: 12.5px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .event {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 10px 4px 0;
    padding: 12px;
    border-radius: 12px;
    background: var(--surface);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .event b {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .event.here {
    background: linear-gradient(90deg, var(--accent-soft), var(--surface));
  }
  .event.here b {
    color: var(--accent);
  }
  button.event {
    width: calc(100% - 8px);
    text-align: left;
    font: inherit;
    font-size: 12.5px;
  }
  button.event:hover {
    background: linear-gradient(90deg, var(--accent-soft), var(--surface-2));
  }
  .more {
    color: var(--accent);
  }
</style>
