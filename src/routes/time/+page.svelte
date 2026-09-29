<script lang="ts">
  import { onDestroy } from "svelte";
  import { getTimers, type Timers } from "$lib/api";
  import { cycles, left, type Cycle } from "$lib/cycles";
  import { getDb } from "$lib/db";

  let timers = $state<Timers | null>(null);
  let error = $state("");
  let now = $state(Date.now());

  async function refresh() {
    try {
      timers = await getTimers();
      error = "";
    } catch (e) {
      error = String(e);
    }
  }
  refresh();

  const tick = setInterval(() => (now = Date.now()), 1000);
  const poll = setInterval(refresh, 5 * 60_000);
  onDestroy(() => {
    clearInterval(tick);
    clearInterval(poll);
  });

  const list = $derived(cycles(now, timers?.cetusEnd ?? 0));
  const sets = getDb().sets;
  const baroHere = $derived(!!timers?.baro && now >= timers.baro.from && now < timers.baro.to);

  // Simple glyphs per state (24×24 strokes).
  const ICON: Record<Cycle["kind"], string> = {
    day: "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    night: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
    warm: "M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z",
    cold: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5",
    fass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    vome: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 9h6",
  };
</script>

<div class="page">
  <h1>Время</h1>

  {#if error}
    <p class="muted">Не удалось получить состояние мира: {error}</p>
  {/if}

  <div class="pills">
    {#if timers?.resurgence}
      {@const r = timers.resurgence}
      <div class="pill resurgence" title="Возрождение Праймов: предметы за Эйя Прайм у Варзии">
        <b>Возрождение Праймов</b>
        {#each r.frames as f}
          {#if sets[f]}<a href="/set?id={encodeURIComponent(f)}">{sets[f].ru}</a>{/if}
        {/each}
        <span class="muted">ещё {left(r.to - now)}</span>
      </div>
    {/if}
    {#if timers?.baro}
      {@const b = timers.baro}
      <div class="pill baro" class:here={baroHere}>
        <b>Баро Ки'Тиир</b>
        {#if baroHere}
          <span>на реле {b.relay}, уйдёт через {left(b.to - now)}</span>
        {:else}
          <span>прибудет через {left(b.from - now)} · {b.relay}</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="grid">
    {#each list as c (c.id)}
      <div class="cycle {c.kind}">
        <div class="icon"><svg viewBox="0 0 24 24"><path d={ICON[c.kind]} /></svg></div>
        <div>
          <div class="title"><span>{c.place}</span> <b>{c.state}</b></div>
          <div class="timer">{left(c.ends - now)}</div>
        </div>
      </div>
    {/each}
  </div>
  <p class="hint">Таймер — до смены состояния. Цетус и Камбионский Дрейф идут по циклу баунти из данных DE, Земля и Долина Сфер — по игровым часам.</p>
</div>

<style>
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 16px;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 16px;
  }
  .pill {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .pill.resurgence {
    border-color: rgba(143, 120, 255, 0.45);
    background: rgba(110, 90, 220, 0.14);
  }
  .pill.resurgence a {
    color: var(--accent);
  }
  .pill.baro.here {
    border-color: rgba(111, 207, 151, 0.45);
  }
  .pill.baro.here span {
    color: var(--good);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .cycle {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 999px;
    background: var(--surface);
  }
  .icon {
    width: 46px;
    height: 46px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--surface-2);
  }
  .icon svg {
    width: 26px;
    height: 26px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .day .icon {
    color: #f0c66b;
  }
  .night .icon {
    color: #9fb4ff;
  }
  .warm .icon {
    color: #ff9a5c;
  }
  .cold .icon {
    color: #8fd8ff;
  }
  .fass .icon {
    color: #e58a6a;
  }
  .vome .icon {
    color: #7fc9b0;
  }
  .title {
    font-size: 13px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .title b {
    color: var(--text);
    font-size: 15px;
  }
  .timer {
    margin-top: 2px;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin-top: 14px;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
