<script lang="ts">
  // Hub tab "Время": open-world cycles with the next changes on the local clock, daily / weekly
  // reset, Baro and Prime Resurgence. Timers come from the shared world store (cached, refreshed).
  import { locale, t } from "$lib/i18n/index.svelte";
  import { cycles, left, CYCLE_ICON, type Cycle } from "$lib/cycles";
  import type { View } from "./hub";
  import { world } from "./worldData.svelte";
  import Resurgence from "$lib/components/Resurgence.svelte";

  let { now, onopen }: { now: number; onopen: (v: View) => void } = $props();

  const cetusEnd = $derived(world.timers?.cetusEnd ?? 0);
  const list = $derived(cycles(now, cetusEnd));
  // Length of the current phase, for the progress bar.
  const PHASE: Record<string, number> = {
    "earth.day": 4 * 3600_000, "earth.night": 4 * 3600_000,
    "cetus.day": 100 * 60_000, "cetus.night": 50 * 60_000, "cambion.fass": 100 * 60_000, "cambion.vome": 50 * 60_000,
    "vallis.warm": 400_000, "vallis.cold": 1200_000,
  };

  // The next few states of a cycle: step past each end.
  function upcoming(c: Cycle, n = 3): { state: string; kind: Cycle["kind"]; at: number }[] {
    const out = [];
    let t = c.ends;
    for (let i = 0; i < n; i++) {
      const next = cycles(t + 1000, cetusEnd).find((x) => x.id === c.id);
      if (!next) break;
      out.push({ state: next.state, kind: next.kind, at: t });
      t = next.ends;
    }
    return out;
  }
  const clock = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

  // Daily reset at 00:00 UTC, weekly on Monday 00:00 UTC.
  const daily = $derived(Math.ceil((now + 1) / 86400_000) * 86400_000);
  const weekly = $derived.by(() => {
    const d = new Date(daily);
    const toMon = (8 - d.getUTCDay()) % 7;
    return daily + toMon * 86400_000;
  });

  const baro = $derived(world.timers?.baro ?? null);
  const baroHere = $derived(!!baro && now >= baro.from && now < baro.to);
  const resurgence = $derived(world.timers?.resurgence ?? null);
  const span = (from: number, to: number) => Math.min(1, Math.max(0, (now - from) / (to - from)));
</script>

<div class="time-tab">
  <div class="cycles">
    {#each list as c (c.id)}
      {@const len = PHASE[`${c.id}.${c.kind}`] ?? 0}
      <section class="panel cycle {c.kind}">
        <div class="head">
          <svg viewBox="0 0 24 24"><path d={CYCLE_ICON[c.kind]} /></svg>
          <div>
            <small>{c.place}</small>
            <b>{c.state}</b>
          </div>
        </div>
        <div class="big">{left(c.ends - now)}</div>
        <div class="until">{t("time.untilChange", { at: clock(c.ends) })}</div>
        <div class="next">
          {#each upcoming(c) as u, i (i)}
            <span class={u.kind}><i></i>{u.state} <em>{clock(u.at)}</em></span>
          {/each}
        </div>
        {#if len > 0}<div class="bar"><div style:width="{(1 - (c.ends - now) / len) * 100}%"></div></div>{/if}
      </section>
    {/each}
  </div>

  <div class="events">
    <section class="panel ev">
      <small>{t("time.daily")}</small>
      <b>{left(daily - now)}</b>
      <span>{t("time.dailyWhat", { at: clock(daily) })}</span>
    </section>
    <section class="panel ev">
      <small>{t("time.weekly")}</small>
      <b>{left(weekly - now)}</b>
      <span>{t("time.weeklyWhat", { at: clock(weekly) })}</span>
    </section>
    {#if baro}
      <section class="panel ev" class:here={baroHere}>
        <small>{t("world.baro")}</small>
        <b>{baroHere ? left(baro.to - now) : left(baro.from - now)}</b>
        <span>{baroHere ? t("time.baroHere", { relay: baro.relay }) : t("time.baroComing", { relay: baro.relay })}</span>
        {#if baroHere}<div class="bar"><div style:width="{span(baro.from, baro.to) * 100}%"></div></div>{/if}
        {#if baroHere && baro.items?.length}
          <span class="frames"><button onclick={() => onopen({ kind: "baro", id: "" })}>{t("baro.show", { n: baro.items.length })}</button></span>
        {/if}
      </section>
    {/if}
    {#if resurgence}
      <section class="panel ev surge">
        <Resurgence r={resurgence} {now} onpick={(id) => onopen({ kind: "set", id })} />
      </section>
    {/if}
  </div>
  {#if world.error && !world.timers}
    <p class="err">{t("time.error", { error: world.error })}</p>
  {/if}
</div>

<style>
  .time-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }
  .cycles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 16px;
  }
  .cycle {
    --c: #f2d27c;
    position: relative;
    padding: 18px 20px 20px;
    overflow: hidden;
  }
  .cycle.night {
    --c: #9fb4ff;
  }
  .cycle.warm {
    --c: #ff9d5c;
  }
  .cycle.cold {
    --c: #8fd8ff;
  }
  .cycle.fass {
    --c: #ffb38a;
  }
  .cycle.vome {
    --c: #9be3d0;
  }
  .cycle::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--c) 18%, transparent), transparent 60%);
    pointer-events: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .head svg {
    width: 34px;
    height: 34px;
    fill: none;
    stroke: var(--c);
    stroke-width: 1.6;
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--c) 50%, transparent));
  }
  .head small {
    display: block;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .head b {
    font-size: 20px;
    font-weight: 600;
    color: var(--c);
  }
  .big {
    margin-top: 14px;
    font-size: clamp(24px, 2.3vw, 30px); /* the app window is narrower than the hub */
    white-space: nowrap;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .until {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .next {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 14px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .next span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .next i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .next .day i {
    background: #f2d27c;
  }
  .next .night i {
    background: #9fb4ff;
  }
  .next .warm i {
    background: #ff9d5c;
  }
  .next .cold i {
    background: #8fd8ff;
  }
  .next .fass i {
    background: #ffb38a;
  }
  .next .vome i {
    background: #9be3d0;
  }
  .next em {
    font-style: normal;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.05);
  }
  .bar div {
    height: 100%;
    background: var(--c, var(--accent));
    box-shadow: 0 0 10px var(--c, var(--accent));
  }
  .events {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }
  .ev {
    position: relative;
    padding: 16px 18px;
    gap: 4px;
    overflow: hidden;
  }
  .ev small {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .ev b {
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .ev > span {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .ev.surge {
    grid-column: 1 / -1;
  }
  .ev.here {
    border-color: rgba(201, 166, 107, 0.45);
  }
  .ev.here b {
    color: var(--accent);
  }
  .frames {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .frames button {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
  }
  .err {
    font-size: 12.5px;
    color: var(--text-faint);
  }
</style>
