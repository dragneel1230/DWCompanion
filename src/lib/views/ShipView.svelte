<script lang="ts">
  // «Орбитер» (app page and hub tab): the ship's own machines from the inventory snapshot — the foundry
  // (what builds, what is worth starting) and Helminth (rank, secretions, subsumes, Invigorations).
  // Head like «Коллекция»: a ring (the next build in the foundry), the snapshot's freshness, big numbers.
  import { fromRust, locale, t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import InvBar from "$lib/inv/InvBar.svelte";
  import Foundry from "$lib/ship/Foundry.svelte";
  import Helminth from "$lib/ship/Helminth.svelte";
  import { rankOf, MAX_RANK } from "$lib/ship/helminth";
  import { shipWorth } from "$lib/ship/shipWorth.svelte";
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
  const worth = $derived(shipWorth());
  const pending = $derived(worth.building);
  const ready = $derived(pending.filter((f) => f.done <= now).length);
  const next = $derived(pending.filter((f) => f.done > now)[0]);
  const helm = $derived(inv?.helminth ? rankOf(inv.helminth.xp) : null);

  // Ring: how far the next build is; full and green when something waits to be claimed.
  const ring = $derived(ready ? 1 : next ? Math.min(1, Math.max(0, 1 - (next.done - now) / Math.max(1, next.done - next.start))) : 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const nextIn = (ms: number) => {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    if (m < 60) return t("unit.minutes", { v: m });
    const h = Math.floor(m / 60);
    return h < 48 ? t("unit.hm", { h, m: m % 60 }) : t("unit.dh", { d: Math.floor(h / 24), h: h % 24 });
  };
  const ago = (ms: number) => {
    const m = Math.max(0, Math.round((now - ms) / 60_000));
    return m < 60
      ? t("coll.minAgo", { v: m })
      : m < 48 * 60
        ? t("coll.hAgo", { v: Math.round(m / 60) })
        : new Date(ms).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  };
</script>

<div class="section" class:compact>
  {#if !inv || !inventory.ready}
    <InvBar title="nav.ship" lead="ship.lead" {compact} />
  {:else}
    <section class="hero">
      <div class="ring" class:done={ready > 0} title={t("ship.ringHint")}>
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} class="track" />
          <circle cx="60" cy="60" r={R} class="arc" stroke-dasharray="{C * ring} {C}" transform="rotate(-90 60 60)" />
        </svg>
        <div class="in">
          <b>{pending.length}</b>
          <small>{t("ship.inFoundry")}</small>
        </div>
      </div>
      <div class="who">
        {#if !compact}<h1>{t("nav.ship")}</h1>{/if}
        <div class="state">
          {#if inv.foundry === undefined}
            {t("ship.noData")}
          {:else if ready}
            <b class="good">{t("ship.kpi.ready", { n: ready })}</b>
          {:else if next}
            {next.name} · <b>{nextIn(next.done - now)}</b>
          {:else}
            {t("ship.kpi.idle")}
          {/if}
        </div>
        <div class="meta">
          <span>{t("inv.at", { v: ago(inv.at) })}</span>
          {#if inventory.auto}<span class="auto">● {t("inv.autoOn")}</span>{/if}
          <button onclick={() => inventory.refresh()} disabled={inventory.busy}>{inventory.busy ? t("inv.refreshing") : t("inv.refresh")}</button>
          <label class="sw" title={t("inv.autoHint")}>
            <input type="checkbox" checked={inventory.auto} onchange={(e) => inventory.setAuto(e.currentTarget.checked)} />
            {t("inv.auto")}
          </label>
        </div>
        {#if inventory.error}<p class="err">{inventory.error.startsWith("rust.") ? fromRust(inventory.error) : t(inventory.error as Key)}</p>{/if}
      </div>
      <div class="counts">
        <div><b class="prog">{worth.useful}</b><span>{t("ship.c.worth")}</span></div>
        <div><b>{worth.almost.length}</b><span>{t("ship.c.almost")}</span></div>
        {#if helm}
          <div><b>{helm.rank}<i>/{MAX_RANK}</i></b><span>{t("ship.c.helminth")}</span></div>
          <div><b>{inv.helminth?.fed.length ?? 0}</b><span>{t("ship.c.fed")}</span></div>
        {/if}
      </div>
    </section>
  {/if}

  <div class="subs">
    {#each SUBS as x (x.id)}
      <button class:on={subs.ship === x.id} onclick={() => setShip(x.id)}>{t(x.label)}</button>
    {/each}
  </div>

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
    gap: 16px;
    min-width: 0;
  }
  .hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 22px;
    padding: 18px 22px;
    border-radius: 16px;
    background: radial-gradient(ellipse at 0% 0%, rgba(201, 166, 107, 0.09), transparent 55%), var(--surface);
  }
  .compact .hero {
    gap: 16px;
    padding: 12px 16px;
  }
  @media (max-width: 980px) {
    .hero {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .counts {
      grid-column: 1 / -1;
    }
  }
  .ring {
    position: relative;
    width: 116px;
    height: 116px;
  }
  .compact .ring {
    width: 84px;
    height: 84px;
  }
  .ring svg {
    width: 100%;
    height: 100%;
  }
  .track {
    fill: none;
    stroke: var(--surface-2);
    stroke-width: 7;
  }
  .arc {
    fill: none;
    stroke: var(--accent);
    stroke-width: 7;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(201, 166, 107, 0.45));
    transition: stroke-dasharray 0.6s ease;
  }
  .ring.done .arc {
    stroke: var(--good);
    filter: drop-shadow(0 0 6px rgba(111, 207, 151, 0.5));
  }
  .in {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .in b {
    font-size: 34px;
    font-weight: 600;
    line-height: 1;
  }
  .compact .in b {
    font-size: 26px;
  }
  .in small {
    margin-top: 3px;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .who {
    min-width: 0;
  }
  .who h1 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 600;
  }
  .state {
    font-size: 14px;
    color: var(--text-dim);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .meta .auto {
    color: var(--good);
  }
  .meta button {
    padding: 5px 12px;
    border-radius: 8px;
    background: var(--accent);
    color: #16120a;
    font-weight: 600;
    font-size: 12.5px;
  }
  .meta button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .sw {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--text-dim);
  }
  .sw input {
    accent-color: var(--good);
  }
  .err {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--warn);
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 4px 26px;
  }
  .counts div {
    display: flex;
    flex-direction: column;
  }
  .counts b {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .counts b i {
    font-style: normal;
    font-size: 15px;
    color: var(--text-faint);
  }
  .counts span {
    font-size: 12px;
    color: var(--text-faint);
  }
  .good {
    color: var(--good);
  }
  .prog {
    color: var(--accent);
  }
  .subs {
    display: flex;
    gap: 4px;
    align-self: flex-start;
    padding: 4px;
    border-radius: 12px;
    background: var(--surface);
  }
  .subs button {
    padding: 8px 18px;
    border-radius: 9px;
    font-size: 14px;
    color: var(--text-dim);
  }
  .subs button.on {
    background: var(--surface-2);
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
</style>
