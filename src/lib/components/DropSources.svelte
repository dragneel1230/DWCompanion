<script lang="ts">
  // "Где выпадает": drop places grouped by kind (missions, bounties, enemies, other), best first,
  // rotation chances as chips. Shared by the Resources tab, relic pages and the hub.
  import { t } from "$lib/i18n/index.svelte";
  import { byKind, pct, rate, KIND_TITLE, KIND_HINT, type DropsDb, type Drop } from "$lib/drops";

  // best: mark the top mission. Off for planet resources: enemies and containers drop most of them,
  // which the tables don't rank, so the top mission reward is not the best place.
  let {
    db,
    drops,
    limit = 6,
    empty = t("drops.noPlaces"),
    best = true,
    source = true,
  }: { db: DropsDb; drops: Drop[] | undefined; limit?: number; empty?: string | null; best?: boolean; source?: boolean } = $props();

  const groups = $derived(byKind(db, drops));
  let open = $state<Record<string, boolean>>({});
</script>

{#each groups as g (g.kind)}
  {@const all = open[g.kind]}
  {@const rows = all ? g.rows : g.rows.slice(0, limit)}
  <div class="group">
    <div class="head">
      <span class="section-title">{KIND_TITLE[g.kind]} · {g.rows.length}</span>
      <span class="hint">{KIND_HINT[g.kind]}</span>
    </div>
    <div class="rows">
      {#each rows as r, i (r.src.name + (r.src.sub ?? ""))}
        <div class="row src" class:top={best && i === 0 && g.kind === "mission"}>
          <span class="name">
            {r.src.name}
            {#if r.src.sub}<small>{r.src.sub}</small>{/if}
          </span>
          {#if best && i === 0 && g.kind === "mission"}<span class="best">{t("drops.best")}</span>{/if}
          <span class="rots">
            {#each r.rots as [rot, c, q]}
              <span class="rot" title={rot ? t("drops.rotation", { r: rot }) : t("drops.chance")}>{#if rot}<b>{rot}</b>{/if}{pct(c)}{#if q}<i>×{q}</i>{/if}</span>
            {/each}
          </span>
          {#if g.kind === "mission"}<span class="rate" title={t("drops.rateHint")}>{rate(r.score)}</span>{/if}
        </div>
      {/each}
    </div>
    {#if g.rows.length > limit}
      <button class="more" onclick={() => (open = { ...open, [g.kind]: !all })}>
        {all ? t("drops.collapse") : t("drops.more", { v: g.rows.length - limit })}
      </button>
    {/if}
  </div>
{:else}
  {#if empty}<p class="muted">{empty}</p>{/if}
{/each}
{#if source && groups.length}<p class="source">{t("drops.source")}</p>{/if}

<style>
  .source {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .group + .group {
    margin-top: 6px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  .head .section-title {
    margin-bottom: 8px;
  }
  .hint {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .src {
    padding: 7px 12px;
  }
  .src.top {
    box-shadow: inset 2px 0 0 var(--accent);
    background: linear-gradient(90deg, var(--accent-soft), var(--surface) 60%);
  }
  .best {
    flex: none;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .rots {
    flex: none;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 55%;
  }
  .rot {
    display: inline-flex;
    gap: 5px;
    align-items: baseline;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rot i {
    font-style: normal;
    color: var(--text-dim);
  }
  .rate {
    flex: none;
    min-width: 64px;
    text-align: right;
    font-size: 12.5px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .rot b {
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .more {
    margin-top: 6px;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .more:hover {
    color: var(--text);
  }
</style>
