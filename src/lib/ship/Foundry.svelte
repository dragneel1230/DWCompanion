<script lang="ts">
  // «Литейная»: what is building (inventory snapshot) with a ring per blueprint, the "ready" notification
  // switch, and the held blueprints that can be started now or miss little.
  import { locale, num, t } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { loadInvCtx, type InvCtx } from "$lib/inv/ctx";
  import { buildTime } from "$lib/craft";
  import { notify } from "$lib/notify/rules.svelte";
  import { ensurePermission } from "$lib/notify/watch.svelte";
  import { building, buildables, isGear, type Buildable } from "./foundry";

  let { compact = false }: { compact?: boolean } = $props();

  let ctx = $state<InvCtx | null>(null);
  loadInvCtx().then((c) => (ctx = c));

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(id);
  });

  const inv = $derived(inventory.data);
  const list = $derived(ctx && inv ? building(ctx, inv) : []);
  const all = $derived(ctx && inv ? buildables(ctx, inv) : []);
  // Gear and parts by default; consumables and resources on request.
  let everything = $state(false);
  const pool = $derived(everything ? all : all.filter(isGear));
  const ready = $derived(pool.filter((b) => !b.missing.length));
  const restReady = $derived(all.filter((b) => !b.missing.length && !isGear(b)).length);
  // Missing at most two kinds of things: worth showing what to get.
  const almost = $derived(pool.filter((b) => b.missing.length > 0 && b.missing.length <= 2).slice(0, 30));
  const known = $derived(inv?.foundry !== undefined);

  const R = 15;
  const C = 2 * Math.PI * R;
  const left = (ms: number) => {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    if (m < 60) return t("unit.minutes", { v: m });
    const h = Math.floor(m / 60);
    return h < 48 ? t("unit.hm", { h, m: m % 60 }) : t("unit.dh", { d: Math.floor(h / 24), h: h % 24 });
  };
  const at = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const href = (b: { item: string | null }) => (b.item ? `/resources?craft=${encodeURIComponent(b.item)}` : undefined);
  const short = (b: Buildable) =>
    b.missing.map((m) => (m.id === "credits" ? t("ship.credits", { v: num(m.need - m.have) }) : `${m.name} ${num(m.have)}/${num(m.need)}`)).join(" · ");

  async function setFoundry(on: boolean) {
    notify.set({ foundry: on });
    if (on) await ensurePermission();
  }
</script>

<div class="grid" class:compact>
  <section class="panel">
    <header>
      <h2>{t("ship.building")}</h2>
      <label class="sw" title={t("ship.notifyHint")}>
        <input type="checkbox" checked={notify.value.foundry} onchange={(e) => setFoundry(e.currentTarget.checked)} />
        <span>{t("ship.notify")}</span>
      </label>
    </header>
    <div class="body">
      {#if !known}
        <div class="empty"><b>{t("ship.noData")}</b><span>{t("ship.noDataHint")}</span></div>
      {:else if !list.length}
        <div class="empty"><b>{t("ship.idle")}</b><span>{t("ship.idleHint")}</span></div>
      {:else}
        <div class="rows">
          {#each list as b (b.oid)}
            {@const done = b.done <= now}
            {@const p = done ? 1 : b.done > b.start ? Math.min(1, Math.max(0, (now - b.start) / (b.done - b.start))) : 0}
            <a class="row build" href={href(b)} class:done>
              <svg class="ring" viewBox="0 0 36 36">
                <circle class="track" cx="18" cy="18" r={R} />
                <circle class="arc" cx="18" cy="18" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - p)} />
              </svg>
              {#if b.icon}<img src={b.icon} alt="" loading="lazy" />{/if}
              <span class="name">
                <b>{b.name}</b>
                <small>{done ? t("ship.claim") : t("ship.readyAt", { v: at(b.done) })}</small>
              </span>
              <span class="when">{done ? t("ship.ready") : left(b.done - now)}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="panel">
    <header>
      <h2>{t("ship.canStart")}</h2>
      <nav class="seg">
        <button class:on={!everything} onclick={() => (everything = false)}>{t("ship.gearOnly")} {ready.length && !everything ? ready.length : ""}</button>
        <button class:on={everything} onclick={() => (everything = true)}>{t("ship.all")}{#if !everything && restReady} +{restReady}{/if}</button>
      </nav>
    </header>
    <div class="body">
      {#if !ctx}
        <p class="faint">{t("coll.loading")}</p>
      {:else if !ready.length}
        <div class="empty"><span>{t("ship.canStartNone")}</span></div>
      {:else}
        <div class="rows">
          {#each ready as b (b.recipe)}
            <a class="row" href={href(b)}>
              {#if b.icon}<img src={b.icon} alt="" loading="lazy" />{/if}
              <span class="name">
                <b>{b.name}{#if b.copies > 1}<em> ×{b.copies}</em>{/if}</b>
                <small>{t("ship.cost", { cr: num(b.credits), time: buildTime(b.time) })}</small>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  {#if almost.length}
    <section class="panel wide">
      <header><h2>{t("ship.almost")}</h2><span class="count">{almost.length}</span></header>
      <div class="body">
        <div class="rows">
          {#each almost as b (b.recipe)}
            <a class="row" href={href(b)}>
              {#if b.icon}<img src={b.icon} alt="" loading="lazy" />{/if}
              <span class="name">
                <b>{b.name}</b>
                <small class="miss">{t("ship.missing", { v: short(b) })}</small>
              </span>
            </a>
          {/each}
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-items: start;
  }
  .grid.compact {
    grid-template-columns: 1fr;
  }
  .wide {
    grid-column: 1 / -1;
  }
  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  header .seg {
    margin-left: auto;
  }
  header .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-faint);
  }
  .sw {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .sw input {
    accent-color: var(--good);
  }
  .rows {
    background: none !important;
    border: none !important;
    padding: 0 !important;
  }
  .row {
    color: var(--text);
  }
  .row img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .name b {
    font-weight: 500;
  }
  .name em {
    font-style: normal;
    color: var(--text-faint);
    font-weight: 400;
  }
  .ring {
    width: 30px;
    height: 30px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.08);
  }
  .arc {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.6s ease;
  }
  .done .arc {
    stroke: var(--good);
  }
  .when {
    flex: none;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .done .when {
    color: var(--good);
    font-weight: 600;
  }
  .miss {
    color: var(--warn) !important;
    opacity: 0.85;
  }
  .faint {
    color: var(--text-faint);
    font-size: 13px;
    padding: 8px;
  }
</style>
