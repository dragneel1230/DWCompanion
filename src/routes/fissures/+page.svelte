<script lang="ts">
  import { onDestroy } from "svelte";
  import { getFissures, type Fissure } from "$lib/api";
  import { getDb, nodeName } from "$lib/db";

  const world = getDb().world;

  type Mode = "normal" | "hard" | "storm";
  const MODES: { id: Mode; label: string }[] = [
    { id: "normal", label: "Обычные" },
    { id: "hard", label: "Стальной путь" },
    { id: "storm", label: "Бури Бездны" },
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
      .filter((f) => new Date(f.expiry).getTime() > now)
      .filter((f) => (mode === "storm" ? f.isStorm : !f.isStorm && f.isHard === (mode === "hard")))
      .sort((a, b) => a.tierNum - b.tierNum || new Date(a.expiry).getTime() - new Date(b.expiry).getTime()),
  );

  const tiers = $derived.by(() => {
    const groups = new Map<string, Fissure[]>();
    for (const f of shown) groups.set(f.tier, [...(groups.get(f.tier) ?? []), f]);
    return [...groups];
  });

  const t = (map: Record<string, string>, s: string) => map[s.toLowerCase()] ?? s;

  function left(expiry: string): string {
    const s = Math.max(0, Math.floor((new Date(expiry).getTime() - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h} ч ${m} мин` : `${m}:${String(sec).padStart(2, "0")}`;
  }
</script>

<div class="page">
  <div class="head">
    <h1>Разломы Бездны</h1>
    <div class="modes">
      {#each MODES as m}
        <button class:on={mode === m.id} onclick={() => (mode = m.id)}>{m.label}</button>
      {/each}
    </div>
  </div>

  {#if error}
    <p class="muted">Не удалось получить разломы: {error}</p>
  {:else if !list.length}
    <p class="muted">Загрузка…</p>
  {/if}

  {#each tiers as [tier, items] (tier)}
    <div class="section-title">{t(world.tier, tier)}</div>
    <div class="rows">
      {#each items as f (f.id)}
        {@const soon = new Date(f.expiry).getTime() - now < 5 * 60_000}
        <div class="row">
          <span class="name">
            {t(world.mission, f.missionType)}
            <small>{nodeName(f.node)}</small>
          </span>
          <span class="enemy">{t(world.faction, f.enemy)}</span>
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
