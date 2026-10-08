<script lang="ts">
  // «Литейная»: what is building (cards with progress), what is worth starting now (a grid of the gear it makes,
  // parts listed on the card, goals first, filter by kind), what misses one or two things, and folded away —
  // what you don't need (you have it) and consumables. Numbers: shipWorth.svelte.ts / foundry.ts.
  import { locale, num, t } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { buildTime, CRAFT_KIND_RU, type CraftKind } from "$lib/craft";
  import { notify } from "$lib/notify/rules.svelte";
  import { ensurePermission } from "$lib/notify/watch.svelte";
  import { partShort, type Buildable } from "./foundry";
  import { shipWorth, type Judged } from "./shipWorth.svelte";

  let { compact = false }: { compact?: boolean } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(id);
  });

  const f = $derived(shipWorth());
  const known = $derived(inventory.data?.foundry !== undefined);

  const ORDER: CraftKind[] = ["frame", "weapon", "companion", "archwing", "mech", "part", "gear", "resource"];
  let kind = $state<"all" | CraftKind>("all");
  const kinds = $derived(ORDER.map((k) => ({ k, n: f.groups.filter((g) => g.kind === k).length })).filter((x) => x.n));
  const shown = $derived(kind === "all" ? f.groups : f.groups.filter((g) => g.kind === kind));
  let open = $state<"skip" | "misc" | null>(null);

  const left = (ms: number) => {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    if (m < 60) return t("unit.minutes", { v: m });
    const h = Math.floor(m / 60);
    return h < 48 ? t("unit.hm", { h, m: m % 60 }) : t("unit.dh", { d: Math.floor(h / 24), h: h % 24 });
  };
  const at = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const craftHref = (id: string | null) => (id ? `/resources?craft=${encodeURIComponent(id)}` : undefined);
  const missing = (b: Buildable) =>
    b.missing.map((m) => (m.id === "credits" ? t("ship.credits", { v: num(m.need - m.have) }) : `${m.name} ${num(m.have)}/${num(m.need)}`));
  const own = (x: Judged) => (x.w.for ? partShort(x.b.name, x.w.forName) : t("ship.bp"));
  const why = (x: Judged) => {
    const what = x.w.forName ?? x.b.name;
    return x.w.v === "have" ? t("ship.why.have", { v: what }) : x.w.v === "enough" ? t("ship.why.enough", { v: what }) : t("ship.why.mastered", { v: what });
  };

  async function setFoundry(on: boolean) {
    notify.set({ foundry: on });
    if (on) await ensurePermission();
  }
</script>

<div class="foundry" class:compact>
  <!-- In the foundry -->
  <section class="block">
    <div class="head">
      <h2>{t("ship.building")}</h2>
      {#if f.building.length}<span class="n">{f.building.length}</span>{/if}
      <label class="sw" title={t("ship.notifyHint")}>
        <input type="checkbox" checked={notify.value.foundry} onchange={(e) => setFoundry(e.currentTarget.checked)} />
        <span>{t("ship.notify")}</span>
      </label>
    </div>
    {#if !known}
      <div class="note"><b>{t("ship.noData")}</b><span>{t("ship.noDataHint")}</span></div>
    {:else if !f.building.length}
      <div class="note"><b>{t("ship.idle")}</b><span>{t("ship.idleHint")}</span></div>
    {:else}
      <div class="builds">
        {#each f.building as b (b.oid)}
          {@const done = b.done <= now}
          {@const p = done ? 1 : b.done > b.start ? Math.min(1, Math.max(0, (now - b.start) / (b.done - b.start))) : 0}
          <a class="build" class:done href={craftHref(b.item)}>
            <div class="art">{#if b.icon}<img src={b.icon} alt="" loading="lazy" />{/if}</div>
            <div class="txt">
              <b>{b.name}</b>
              <small>{done ? t("ship.claim") : t("ship.readyAt", { v: at(b.done) })}</small>
              <div class="prog"><i style:width="{p * 100}%"></i></div>
            </div>
            <span class="when">{done ? t("ship.ready") : left(b.done - now)}</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Worth starting -->
  <section class="block">
    <div class="head">
      <h2>{t("ship.worth")}</h2>
      {#if f.groups.length}<span class="n">{f.groups.length}</span>{/if}
    </div>
    {#if !f.ctx}
      <p class="faint">{t("coll.loading")}</p>
    {:else if !f.groups.length}
      <div class="note"><b>{t("ship.nothingUsefulTitle")}</b><span>{f.skip.length || f.misc.length ? t("ship.nothingUseful") : t("ship.canStartNone")}</span></div>
    {:else}
      <p class="hint">{t("ship.worthHint")}</p>
      {#if kinds.length > 1}
        <div class="cats">
          <button class:on={kind === "all"} onclick={() => (kind = "all")}>{t("res.kind.all")} <i>{f.groups.length}</i></button>
          {#each kinds as k (k.k)}
            <button class:on={kind === k.k} onclick={() => (kind = k.k)}>{cap(CRAFT_KIND_RU[k.k])} <i>{k.n}</i></button>
          {/each}
        </div>
      {/if}
      <div class="grid">
        {#each shown as g (g.key)}
          {@const one = g.items.length === 1 ? g.items[0].b : null}
          <a class="card" class:goal={g.goal} href={craftHref(g.key)}>
            {#if g.goal}<span class="flag">⚑ {t("ship.forGoal")}</span>{/if}
            <div class="art"><img src={g.icon} alt="" loading="lazy" /></div>
            <b title={g.name}>{g.name}</b>
            <div class="parts">
              {#each g.items as x (x.b.recipe)}
                <span class="pc">{own(x)}{#if x.b.copies > 1}<em>×{x.b.copies}</em>{/if}</span>
              {/each}
            </div>
            {#if one}<small class="cost">{t("ship.cost", { cr: num(one.credits), time: buildTime(one.time) })}</small>{/if}
          </a>
        {/each}
      </div>
    {/if}
  </section>

  {#if f.almost.length}
    <section class="block">
      <div class="head">
        <h2>{t("ship.almost")}</h2>
        <span class="n">{f.almost.length}</span>
      </div>
      <div class="grid small">
        {#each f.almost as x (x.b.recipe)}
          <a class="card" class:goal={x.w.v === "goal"} href={craftHref(x.b.item)}>
            {#if x.w.v === "goal"}<span class="flag">⚑</span>{/if}
            <div class="art"><img src={x.w.forIcon ?? x.b.icon} alt="" loading="lazy" /></div>
            <b title={x.b.name}>{x.b.name}</b>
            {#each missing(x.b) as m}<small class="miss">− {m}</small>{/each}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if f.skip.length || f.misc.length}
    <section class="block quiet">
      <div class="toggles">
        {#if f.skip.length}
          <button class:on={open === "skip"} onclick={() => (open = open === "skip" ? null : "skip")}>
            {t("ship.skip", { n: f.skip.length })} <span class="caret">{open === "skip" ? "▴" : "▾"}</span>
          </button>
        {/if}
        {#if f.misc.length}
          <button class:on={open === "misc"} onclick={() => (open = open === "misc" ? null : "misc")}>
            {t("ship.misc", { n: f.misc.length })} <span class="caret">{open === "misc" ? "▴" : "▾"}</span>
          </button>
        {/if}
      </div>
      {#if open}
        <div class="minis">
          {#each open === "skip" ? f.skip : f.misc as x (x.b.recipe)}
            <a class="mini" href={craftHref(x.b.item)}>
              {#if x.b.icon}<img src={x.b.icon} alt="" loading="lazy" />{/if}
              <span>
                <b>{x.b.name}{#if x.b.copies > 1}<em> ×{x.b.copies}</em>{/if}</b>
                <small>{open === "skip" ? why(x) : t("ship.cost", { cr: num(x.b.credits), time: buildTime(x.b.time) })}</small>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .foundry {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .head .n {
    font-size: 12px;
    color: var(--text-faint);
  }
  .sw {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .sw input {
    accent-color: var(--good);
  }
  .note {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--surface);
    font-size: 13px;
    color: var(--text-dim);
  }
  .note b {
    color: var(--text);
    font-weight: 600;
  }
  .hint {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .faint {
    color: var(--text-faint);
    font-size: 13px;
  }

  /* In the foundry */
  .builds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 10px;
  }
  .build {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid transparent;
    color: var(--text);
  }
  .build:hover {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .build.done {
    border-color: rgba(111, 207, 151, 0.45);
    background: linear-gradient(90deg, rgba(111, 207, 151, 0.12), var(--surface) 70%);
  }
  .build .art {
    width: 60px;
    height: 60px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .build .art img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .txt b {
    font-size: 14.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .txt small {
    font-size: 12px;
    color: var(--text-faint);
  }
  .done .txt small {
    color: var(--good);
  }
  .prog {
    margin-top: 6px;
    height: 5px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .prog i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.6s ease;
  }
  .done .prog i {
    background: var(--good);
  }
  .when {
    flex: none;
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .done .when {
    color: var(--good);
  }

  /* Filters */
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .cats button {
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .cats button i {
    font-style: normal;
    color: var(--text-faint);
    margin-left: 2px;
  }
  .cats button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  /* Cards */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }
  .grid.small {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
  .compact .grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 11px 11px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid transparent;
    color: var(--text);
    min-width: 0;
  }
  .card:hover {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .card.goal {
    border-color: rgba(201, 166, 107, 0.35);
    background: linear-gradient(180deg, rgba(201, 166, 107, 0.1), var(--surface) 60%);
  }
  .flag {
    position: absolute;
    top: 8px;
    left: 9px;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
  }
  .card .art {
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2px;
  }
  .card .art img {
    max-width: 100%;
    max-height: 80px;
    object-fit: contain;
  }
  .grid.small .art {
    height: 60px;
  }
  .grid.small .art img {
    max-height: 60px;
  }
  .card b {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .parts {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .pc {
    padding: 1px 7px;
    border-radius: 6px;
    font-size: 11.5px;
    color: var(--text-dim);
    background: var(--surface-2);
  }
  .card:hover .pc {
    background: var(--bg);
  }
  .pc em {
    font-style: normal;
    margin-left: 3px;
    color: var(--accent);
  }
  .cost {
    font-size: 11px;
    color: var(--text-faint);
  }
  .miss {
    font-size: 11.5px;
    color: var(--warn);
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Folded away */
  .quiet {
    gap: 8px;
  }
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .toggles button {
    padding: 7px 14px;
    border-radius: 10px;
    background: var(--surface);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .toggles button:hover,
  .toggles button.on {
    color: var(--text);
    background: var(--surface-2);
  }
  .caret {
    margin-left: 4px;
    color: var(--text-faint);
  }
  .minis {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 6px;
  }
  .mini {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    opacity: 0.8;
  }
  .mini:hover {
    opacity: 1;
    background: var(--surface-2);
  }
  .mini img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex: none;
  }
  .mini span {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .mini b {
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini em {
    font-style: normal;
    color: var(--text-faint);
  }
  .mini small {
    font-size: 11px;
    color: var(--text-faint);
  }
</style>
