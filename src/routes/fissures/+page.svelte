<script lang="ts">
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { getFissures, type Fissure } from "$lib/api";

  type Mode = "normal" | "hard" | "storm";
  const MODES: { id: Mode; label: Key }[] = [
    { id: "normal", label: "fissures.normal" },
    { id: "hard", label: "fissures.hard" },
    { id: "storm", label: "fissures.stormFull" },
  ];

  let mode = $state<Mode>("normal");
  let list = $state<Fissure[]>([]);
  let error = $state("");
  let now = $state(Date.now());

  async function refresh() {
    try {
      list = await getFissures();
      error = "";
    } catch (e) {
      error = String(e);
    }
  }
  refresh();

  // One clock for all timers; re-fetch once a minute to pick up new fissures.
  const tick = setInterval(() => (now = Date.now()), 1000);
  const poll = setInterval(refresh, 60_000);
  onDestroy(() => {
    clearInterval(tick);
    clearInterval(poll);
  });

  const shown = $derived(
    list
      .filter((f) => f.expiry > now)
      .filter((f) => (mode === "storm" ? f.isStorm : !f.isStorm && f.isHard === (mode === "hard")))
      .sort((a, b) => a.tierNum - b.tierNum || a.expiry - b.expiry),
  );

  const tiers = $derived.by(() => {
    const groups = new Map<string, Fissure[]>();
    for (const f of shown) groups.set(f.tier, [...(groups.get(f.tier) ?? []), f]);
    return [...groups];
  });

  function left(expiry: number): string {
    const s = Math.max(0, Math.floor((expiry - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? t("unit.hm", { h, m }) : `${m}:${String(sec).padStart(2, "0")}`;
  }
</script>

<div class="page">
  <div class="head">
    <h1>{t("fissures.title")}</h1>
    <div class="modes">
      {#each MODES as m}
        <button class:on={mode === m.id} onclick={() => (mode = m.id)}>{t(m.label)}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <p class="muted">{t("fissures.error", { error })}</p>
  {:else if !list.length}
    <p class="muted">{t("common.loading")}</p>
  {/if}

  {#each tiers as [tier, items] (tier)}
    <div class="section-title">{tier}</div>
    <div class="rows">
      {#each items as f (f.id)}
        {@const soon = f.expiry - now < 5 * 60_000}
        <div class="row">
          <span class="name">
            {f.mission}
            <small>{f.node}</small>
          </span>
          <span class="enemy">{f.enemy}</span>
          <span class="time" class:soon>{left(f.expiry)}</span>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0;
  }
  .modes {
    display: flex;
    gap: 4px;
    background: var(--surface);
    padding: 3px;
    border-radius: 10px;
  }
  .modes button {
    padding: 6px 12px;
    border-radius: 8px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .modes button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .enemy {
    width: 120px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .time {
    width: 90px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .time.soon {
    color: var(--warn);
  }
</style>
