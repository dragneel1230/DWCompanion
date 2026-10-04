<script lang="ts">
  import { t } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { getTimers, type Timers } from "$lib/api";
  import { cycles, left, CYCLE_ICON } from "$lib/cycles";
  import { goto } from "$app/navigation";
  import Resurgence from "$lib/components/Resurgence.svelte";

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
  const baroHere = $derived(!!timers?.baro && now >= timers.baro.from && now < timers.baro.to);

</script>

<div class="page">
  <h1>{t("nav.time")}</h1>

  {#if error}
    <p class="muted">{t("world.error", { error })}</p>
  {/if}

  <div class="pills">
    {#if timers?.resurgence}
      {@const r = timers.resurgence}
      <div class="surge" title={t("timepage.resurgenceHint")}>
        <Resurgence {r} {now} onpick={(id) => goto(`/set?id=${encodeURIComponent(id)}`)} />
      </div>
    {/if}
    {#if timers?.baro}
      {@const b = timers.baro}
      <div class="pill baro" class:here={baroHere}>
        <b>{t("world.baro")}</b>
        {#if baroHere}
          <span>{t("world.baroHere", { relay: b.relay, left: left(b.to - now) })}</span>
        {:else}
          <span>{t("world.baroComing", { relay: b.relay, left: left(b.from - now) })}</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="grid">
    {#each list as c (c.id)}
      <div class="cycle {c.kind}">
        <div class="icon"><svg viewBox="0 0 24 24"><path d={CYCLE_ICON[c.kind]} /></svg></div>
        <div>
          <div class="title"><span>{c.place}</span> <b>{c.state}</b></div>
          <div class="timer">{left(c.ends - now)}</div>
        </div>
      </div>
    {/each}
  </div>
  <p class="hint">{t("timepage.hint")}</p>
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
  .surge {
    flex-basis: 100%;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(143, 120, 255, 0.45);
    background: rgba(110, 90, 220, 0.14);
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
