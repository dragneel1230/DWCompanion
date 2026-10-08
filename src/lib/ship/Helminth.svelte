<script lang="ts">
  // «Гельминт»: a big rank ring and the six secretions as tiles, this week's Invigorations as portrait cards, then
  // the warframes as a card grid — what subsuming each gives and costs, which are subsumed (their ability's
  // injection cost), which are missing.
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

  const R = 52;
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

{#snippet card(f: HelminthFrame)}
  {@const list = sub === "fed" ? f.inject : f.cost}
  <a class="card" class:ok={sub !== "missing" && enough(list)} class:dim={sub === "missing"} href="/frame?id={encodeURIComponent(f.frame)}">
    <div class="art"><img src={f.icon} alt="" loading="lazy" /></div>
    <b title={f.name}>{f.name}</b>
    <span class="ab" title={f.ability.name}>{#if f.ability.icon}<img src={f.ability.icon} alt="" />{/if}<span>{f.ability.name}</span></span>
    {@render costs(list)}
    {#if sub === "can"}
      <span class="tag" class:good={f.prime} class:warn={!f.prime}>{f.prime ? t("helm.primeKept") : t("helm.onlyCopy")}</span>
    {:else if sub === "fed"}
      <span class="tag" class:good={enough(f.inject)}>{enough(f.inject) ? t("helm.injectOk") : t("helm.injectShort")}</span>
    {/if}
  </a>
{/snippet}

{#if !inv}
  <div class="note"><b>{t("ship.noData")}</b><span>{t("ship.noDataHint")}</span></div>
{:else if !h}
  <div class="note">
    <b>{inv.foundry === undefined ? t("ship.noData") : t("helm.none")}</b>
    <span>{inv.foundry === undefined ? t("ship.noDataHint") : t("helm.noneHint")}</span>
  </div>
{:else}
  <div class="helm" class:compact>
    <section class="overview">
      {#if rank}
        {@const p = rank.to ? (rank.xp - rank.from) / (rank.to - rank.from) : 1}
        <div class="rank">
          <div class="ring">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={R} class="track" />
              <circle cx="60" cy="60" r={R} class="arc" stroke-dasharray="{C * p} {C}" transform="rotate(-90 60 60)" />
            </svg>
            <div class="in"><b>{rank.rank}</b><small>{t("helm.rank")}</small></div>
          </div>
          <div class="rtext">
            <b>{t("helm.rankOf", { r: rank.rank, max: MAX_RANK })}</b>
            <small>{rank.to ? t("helm.toNext", { v: num(rank.to - rank.xp) }) : t("helm.maxRank")}</small>
            <div class="fed">
              <span>{t("helm.fedCount", { n: groups.fed.length, all: frames.length })}</span>
              <span class="bar"><i style:width="{frames.length ? (groups.fed.length / frames.length) * 100 : 0}%"></i></span>
            </div>
          </div>
        </div>
      {/if}
      <div class="secs">
        {#each SECRETIONS as id (id)}
          {@const s = sec(id)}
          {@const v = pct(h.res[id] ?? 0)}
          <div class="sec" class:low={v < 10} title={s?.name}>
            {#if s?.icon}<img src={iconUrl(s.icon)} alt="" />{/if}
            <span class="sv">
              <small>{s?.name ?? id.split("/").pop()}</small>
              <b>{num(v)}%</b>
            </span>
            <span class="bar"><i style:width="{Math.min(100, v)}%"></i></span>
          </div>
        {/each}
      </div>
    </section>

    <section class="block">
      <div class="head">
        <h2>{t("helm.invig")}</h2>
        <span class="n">{t("helm.reset", { v: left(nextMonday(now) - now) })}</span>
      </div>
      {#if !week.length}
        <div class="note"><span>{t("helm.invigNone")}</span></div>
      {:else}
        <div class="offers">
          {#each week as o (o.base)}
            {@const on = o.mine.find((m) => m.invig)}
            <div class="offer" class:have={o.mine.length} class:on={!!on}>
              <div class="art">{#if o.icon}<img src={o.icon} alt="" loading="lazy" />{/if}</div>
              <div class="otext">
                <b>{o.name}</b>
                {#if on?.invig}
                  <small class="good">{t("helm.invigOn", { a: upgrade(on.invig[0]), b: upgrade(on.invig[1]) })}</small>
                {:else if o.mine.length}
                  <small>{t("helm.youHave", { v: o.mine.map((m) => m.name).join(", ") })}</small>
                {:else}
                  <small class="faint">{t("helm.notOwned")}</small>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="block">
      <div class="head tools">
        <nav class="seg">
          {#each SUBS as x (x.id)}
            <button class:on={sub === x.id} onclick={() => (sub = x.id)}>{t(x.label)} <em>{groups[x.id].length}</em></button>
          {/each}
        </nav>
        <input class="q" placeholder={t("helm.search")} bind:value={q} />
      </div>
      <p class="hint">{t(sub === "can" ? "helm.canHint" : sub === "fed" ? "helm.fedHint" : "helm.missingHint")}</p>
      {#if !shown.length}
        <div class="note"><span>{t("helm.emptyList")}</span></div>
      {:else}
        <div class="grid">
          {#each shown as f (f.frame)}{@render card(f)}{/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .helm {
    display: flex;
    flex-direction: column;
    gap: 22px;
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
    margin-left: auto;
    font-size: 12px;
    color: var(--text-faint);
  }
  .hint {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .good {
    color: var(--good) !important;
  }
  .faint {
    color: var(--text-faint);
  }

  /* Rank + secretions */
  .overview {
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.6fr);
    gap: 12px;
  }
  .compact .overview {
    grid-template-columns: 1fr;
  }
  @media (max-width: 980px) {
    .overview {
      grid-template-columns: 1fr;
    }
  }
  .rank {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 18px 20px;
    border-radius: 16px;
    background: radial-gradient(ellipse at 0% 0%, rgba(159, 211, 106, 0.1), transparent 60%), var(--surface);
  }
  .ring {
    position: relative;
    width: 116px;
    height: 116px;
    flex: none;
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
    stroke: #9fd36a;
    stroke-width: 7;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(159, 211, 106, 0.45));
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
    font-size: 36px;
    font-weight: 600;
    line-height: 1;
  }
  .in small {
    margin-top: 2px;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .rtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rtext > b {
    font-size: 18px;
    font-weight: 600;
  }
  .rtext > small {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .fed {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .bar {
    height: 5px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: #9fd36a;
  }
  .secs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .sec {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
  }
  .sec img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .sv {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sv small {
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sv b {
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .sec .bar {
    grid-column: 1 / -1;
  }
  .sec.low .sv b {
    color: var(--warn);
  }
  .sec.low .bar i {
    background: var(--warn);
  }

  /* Invigorations */
  .offers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .compact .offers {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
  .offer {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid transparent;
  }
  .offer.have {
    border-color: rgba(201, 166, 107, 0.3);
    background: linear-gradient(90deg, rgba(201, 166, 107, 0.1), var(--surface) 65%);
  }
  .offer.on {
    border-color: rgba(111, 207, 151, 0.4);
    background: linear-gradient(90deg, rgba(111, 207, 151, 0.12), var(--surface) 65%);
  }
  .offer .art {
    width: 76px;
    height: 76px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .offer .art img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .offer:not(.have) .art img {
    opacity: 0.55;
    filter: saturate(0.5);
  }
  .otext {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .otext b {
    font-size: 16px;
    font-weight: 600;
  }
  .otext small {
    font-size: 12px;
    color: var(--text-dim);
  }

  /* Warframes */
  .tools {
    align-items: center;
    flex-wrap: wrap;
  }
  .seg em {
    font-style: normal;
    margin-left: 4px;
    color: var(--text-faint);
  }
  .q {
    margin-left: auto;
    width: 260px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 13px;
    outline: none;
  }
  .q:focus {
    border-color: var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    gap: 8px;
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
  .card.ok {
    background: linear-gradient(180deg, rgba(111, 207, 151, 0.06), var(--surface) 60%);
  }
  .card.dim .art img {
    opacity: 0.55;
    filter: saturate(0.5);
  }
  .card .art {
    height: 84px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card .art img {
    max-width: 100%;
    max-height: 84px;
    object-fit: contain;
  }
  .card > b {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ab {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--text-dim);
    min-width: 0;
  }
  .ab img {
    width: 18px;
    height: 18px;
    object-fit: contain;
    flex: none;
  }
  .ab span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    align-self: flex-start;
    margin-top: 4px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 10.5px;
    color: var(--text-dim);
    background: var(--surface-2);
  }
  .tag.good {
    color: var(--good);
    background: rgba(111, 207, 151, 0.14);
  }
  .tag.warn {
    color: var(--warn);
    background: rgba(255, 170, 90, 0.12);
  }
  .costs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
  }
  .cost {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 6px;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .card:hover .cost {
    background: var(--bg);
  }
  .cost img {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }
  .cost.short {
    color: var(--warn);
  }
</style>
