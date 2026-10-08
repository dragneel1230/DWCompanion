<script lang="ts">
  // «Гельминт»: rank ring and secretions, this week's Invigorations, then the warframes — what subsuming
  // each gives and costs, which are subsumed (their ability's injection cost), which are missing.
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { inventory } from "$lib/inventory.svelte";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { left } from "$lib/cycles";
  import { helminthFrames, offers, rankOf, nextMonday, enough, pct, SECRETIONS, MAX_RANK, type Cost, type HelminthFrame } from "./helminth";

  let { compact = false }: { compact?: boolean } = $props();

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });

  const inv = $derived(inventory.data);
  const h = $derived(inv?.helminth);
  const rank = $derived(h ? rankOf(h.xp) : null);
  const frames = $derived(db && inv && h ? helminthFrames(db, inv, h) : []);
  const week = $derived(db && inv && h ? offers(db, inv, h) : []);

  type Sub = "can" | "fed" | "missing";
  let sub = $state<Sub>("can");
  let q = $state("");
  const SUBS: { id: Sub; label: Key }[] = [
    { id: "can", label: "helm.can" },
    { id: "fed", label: "helm.fed" },
    { id: "missing", label: "helm.missing" },
  ];
  const groups = $derived({
    can: frames.filter((f) => !f.fed && f.owned),
    fed: frames.filter((f) => f.fed),
    missing: frames.filter((f) => !f.fed && !f.owned),
  });
  const shown = $derived.by(() => {
    const s = q.trim().toLowerCase();
    const list = groups[sub];
    const out = s ? list.filter((f) => f.name.toLowerCase().includes(s) || f.ability.name.toLowerCase().includes(s)) : list;
    // Subsume candidates: affordable and harmless (Prime kept) first.
    return sub === "can" ? [...out].sort((a, b) => Number(enough(b.cost)) - Number(enough(a.cost)) || Number(b.prime) - Number(a.prime)) : out;
  });

  const R = 34;
  const C = 2 * Math.PI * R;
  const sec = (id: string) => db?.infest?.secretions[id];
  const upgrade = (p: string) => p.split("/").pop()!.replace(/([a-z])([A-Z])/g, "$1 $2");
</script>

{#snippet costs(list: Cost[])}
  <span class="costs">
    {#each list as c (c.id)}
      {@const s = sec(c.id)}
      <span class="cost" class:short={c.have < c.need} title={s?.name}>
        {#if s?.icon}<img src={iconUrl(s.icon)} alt="" />{/if}{num(pct(c.need))}%
      </span>
    {/each}
  </span>
{/snippet}

{#snippet frameRow(f: HelminthFrame)}
  <a class="row" href="/frame?id={encodeURIComponent(f.frame)}">
    <img src={f.icon} alt="" loading="lazy" />
    <span class="name">
      <b>{f.name}</b>
      <small class="ab">{#if f.ability.icon}<img src={f.ability.icon} alt="" />{/if}{f.ability.name}</small>
    </span>
    {#if sub === "can"}
      <span class="tag" class:good={f.prime} class:warn={!f.prime}>{f.prime ? t("helm.primeKept") : t("helm.onlyCopy")}</span>
      {@render costs(f.cost)}
    {:else if sub === "fed"}
      <span class="tag" class:good={enough(f.inject)}>{enough(f.inject) ? t("helm.injectOk") : t("helm.injectShort")}</span>
      {@render costs(f.inject)}
    {:else}
      {@render costs(f.cost)}
    {/if}
  </a>
{/snippet}

{#if !inv}
  <div class="panel"><div class="empty"><b>{t("ship.noData")}</b><span>{t("ship.noDataHint")}</span></div></div>
{:else if !h}
  <div class="panel">
    <div class="empty">
      <b>{inv.foundry === undefined ? t("ship.noData") : t("helm.none")}</b>
      <span>{inv.foundry === undefined ? t("ship.noDataHint") : t("helm.noneHint")}</span>
    </div>
  </div>
{:else}
  <div class="top" class:compact>
    <section class="panel state">
      {#if rank}
        {@const p = rank.to ? (rank.xp - rank.from) / (rank.to - rank.from) : 1}
        <div class="rank">
          <svg viewBox="0 0 80 80">
            <circle class="track" cx="40" cy="40" r={R} />
            <circle class="arc" cx="40" cy="40" r={R} stroke-dasharray={C} stroke-dashoffset={C * (1 - p)} />
          </svg>
          <div class="in"><b>{rank.rank}</b><small>{t("helm.rank")}</small></div>
        </div>
        <div class="rank-text">
          <b>{t("helm.rankOf", { r: rank.rank, max: MAX_RANK })}</b>
          <small>{rank.to ? t("helm.toNext", { v: num(rank.to - rank.xp) }) : t("helm.maxRank")}</small>
          <small>{t("helm.fedCount", { n: groups.fed.length, all: frames.length })}</small>
        </div>
      {/if}
      <div class="secs">
        {#each SECRETIONS as id (id)}
          {@const s = sec(id)}
          {@const v = pct(h.res[id] ?? 0)}
          <div class="sec" title={s?.name}>
            {#if s?.icon}<img src={iconUrl(s.icon)} alt="" />{/if}
            <span class="sname">{s?.name ?? id.split("/").pop()}</span>
            <span class="bar"><i style:width="{Math.min(100, v)}%"></i></span>
            <span class="v">{num(v)}%</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="panel">
      <header><h2>{t("helm.invig")}</h2><span class="count">{t("helm.reset", { v: left(nextMonday(now) - now) })}</span></header>
      <div class="body">
        {#if !week.length}
          <div class="empty"><span>{t("helm.invigNone")}</span></div>
        {:else}
          <div class="offers">
            {#each week as o (o.base)}
              {@const inv0 = o.mine.find((m) => m.invig)}
              <div class="offer" class:have={o.mine.length}>
                {#if o.icon}<img src={o.icon} alt="" loading="lazy" />{/if}
                <b>{o.name}</b>
                {#if inv0?.invig}
                  <small class="good">{t("helm.invigOn", { a: upgrade(inv0.invig[0]), b: upgrade(inv0.invig[1]) })}</small>
                {:else if o.mine.length}
                  <small>{t("helm.youHave", { v: o.mine.map((m) => m.name).join(", ") })}</small>
                {:else}
                  <small class="faint">{t("helm.notOwned")}</small>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>

  <section class="panel list">
    <header>
      <nav class="seg">
        {#each SUBS as x (x.id)}
          <button class:on={sub === x.id} onclick={() => (sub = x.id)}>{t(x.label)} <em>{groups[x.id].length}</em></button>
        {/each}
      </nav>
      <input class="q" placeholder={t("helm.search")} bind:value={q} />
    </header>
    <p class="hint">{t(sub === "can" ? "helm.canHint" : sub === "fed" ? "helm.fedHint" : "helm.missingHint")}</p>
    <div class="body">
      {#if !shown.length}
        <div class="empty"><span>{t("helm.emptyList")}</span></div>
      {:else}
        <div class="rows">
          {#each shown as f (f.frame)}{@render frameRow(f)}{/each}
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 14px;
  }
  .top.compact {
    grid-template-columns: 1fr;
  }
  @media (max-width: 900px) {
    .top {
      grid-template-columns: 1fr;
    }
  }
  .state {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px 18px;
    padding: 18px;
    align-items: center;
  }
  .rank {
    position: relative;
    width: 84px;
    height: 84px;
  }
  .rank svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .rank circle {
    fill: none;
    stroke-width: 5;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.07);
  }
  .arc {
    stroke: #9fd36a;
    stroke-linecap: round;
  }
  .rank .in {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .rank .in b {
    font-size: 26px;
    font-weight: 600;
    line-height: 1;
  }
  .rank .in small {
    font-size: 10px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .rank-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .rank-text b {
    font-size: 16px;
    font-weight: 600;
  }
  .rank-text small {
    color: var(--text-dim);
    font-size: 12.5px;
  }
  .secs {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 18px;
  }
  .sec {
    display: grid;
    grid-template-columns: 20px 86px minmax(0, 1fr) 46px;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
  }
  .sec img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .sname {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: #9fd36a;
  }
  .v {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  header .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-faint);
  }
  .offers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .offer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    text-align: center;
    opacity: 0.6;
  }
  .offer.have {
    opacity: 1;
    box-shadow: inset 0 0 0 1px rgba(159, 211, 106, 0.25);
  }
  .offer img {
    width: 52px;
    height: 52px;
    object-fit: contain;
  }
  .offer b {
    font-weight: 500;
    font-size: 13px;
  }
  .offer small {
    font-size: 11.5px;
    color: var(--text-dim);
    line-height: 1.35;
  }
  .good {
    color: var(--good) !important;
  }
  .faint {
    color: var(--text-faint) !important;
  }
  .list header {
    flex-wrap: wrap;
  }
  .seg em {
    font-style: normal;
    opacity: 0.6;
    margin-left: 3px;
  }
  .q {
    margin-left: auto;
    width: 220px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.03);
    font-size: 12.5px;
    outline: none;
  }
  .q:focus {
    border-color: var(--text-faint);
  }
  .hint {
    margin: 0 18px 8px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .rows {
    background: none !important;
    border: none !important;
    padding: 0 !important;
  }
  .row {
    color: var(--text);
  }
  .row > img {
    width: 38px;
    height: 38px;
    object-fit: contain;
    flex: none;
  }
  .name b {
    font-weight: 500;
  }
  .ab {
    display: flex !important;
    align-items: center;
    gap: 5px;
  }
  .ab img {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.8;
  }
  .tag {
    flex: none;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 20px;
    color: var(--text-faint);
    background: rgba(255, 255, 255, 0.04);
  }
  .tag.good {
    color: var(--good);
    background: rgba(111, 207, 151, 0.1);
  }
  .tag.warn {
    color: var(--warn);
    background: rgba(224, 161, 90, 0.1);
  }
  .costs {
    flex: none;
    display: flex;
    gap: 8px;
    width: 230px;
    justify-content: flex-end;
  }
  .cost {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .cost img {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }
  .cost.short {
    color: var(--warn);
  }
  :global(.compact) .costs {
    width: auto;
  }
</style>
