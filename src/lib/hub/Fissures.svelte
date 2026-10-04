<script lang="ts">
  // Void fissures, compact: normal / Steel Path / storms, tier badge, mission, time left.
  // Data comes from the shared world store: cached rows at once, background refresh adds / drops rows.
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { slide } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { TIER_COLOR } from "./hub";
  import { world } from "./worldData.svelte";

  let { now }: { now: number } = $props();

  type Mode = "normal" | "hard" | "storm";
  const MODES: { id: Mode; label: Key }[] = [
    { id: "normal", label: "fissures.normal" },
    { id: "hard", label: "fissures.hard" },
    { id: "storm", label: "fissures.storm" },
  ];
  const KEY = "dwc.hub.fissures";

  let mode = $state<Mode>(readMode());

  function readMode(): Mode {
    try {
      const m = localStorage.getItem(KEY);
      return m === "hard" || m === "storm" ? m : "normal";
    } catch {
      return "normal";
    }
  }
  function setMode(m: Mode) {
    mode = m;
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // storage unavailable
    }
  }

  const shown = $derived(
    world.fissures
      .filter((f) => f.expiry > now)
      .filter((f) => (mode === "storm" ? f.isStorm : !f.isStorm && f.isHard === (mode === "hard")))
      .sort((a, b) => a.tierNum - b.tierNum || a.expiry - b.expiry),
  );

  function left(expiry: number): string {
    const s = Math.max(0, Math.floor((expiry - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? t("unit.hm", { h, m }) : `${m}:${String(s % 60).padStart(2, "0")}`;
  }
</script>

<section class="panel">
  <header>
    <h2>{t("nav.fissures")}</h2>
    <div class="seg">
      {#each MODES as m}
        <button class:on={mode === m.id} onclick={() => setMode(m.id)}>{t(m.label)}</button>
      {/each}
    </div>
  </header>
  <div class="body">
    {#if world.error && !world.loaded}
      <div class="empty"><span>{t("fissures.error", { error: world.error })}</span></div>
    {:else if !world.loaded}
      <div class="empty"><span>{t("common.loading")}</span></div>
    {/if}
    {#each shown as f (f.id)}
      {@const soon = f.expiry - now < 5 * 60_000}
      <div class="fis" in:slide={{ duration: 220 }} out:slide={{ duration: 220 }} animate:flip={{ duration: 220 }}>
        <span class="tier" style:--c={TIER_COLOR[f.tierNum] ?? "var(--text-dim)"}>{f.tier}</span>
        <span class="what">
          {f.mission}
          <small>{f.node}{f.enemy ? ` · ${f.enemy}` : ""}</small>
        </span>
        <span class="time" class:soon>{left(f.expiry)}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  header {
    justify-content: space-between;
  }
  .fis {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 8px;
    border-radius: 10px;
  }
  .fis:hover {
    background: var(--surface);
  }
  .tier {
    flex: none;
    width: 66px;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--c);
  }
  .tier::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 8px var(--c);
  }
  .what {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
  }
  .what small {
    display: block;
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time {
    flex: none;
    font-size: 12.5px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .time.soon {
    color: var(--warn);
  }
</style>
