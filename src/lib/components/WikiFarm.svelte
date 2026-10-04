<script lang="ts">
  // "Где фармят игроки": recommended nodes from the wiki's "Farming Locations" (scripts/fetch-wiki-farming.mjs).
  // Players' advice, not DE data: labelled so, with a link to the page. Shared by the Resources tab and the hub.
  import { t } from "$lib/i18n/index.svelte";
  import { wikiUrl, type DropsDb, type Resource } from "$lib/drops";

  let { db, res }: { db: DropsDb; res: Resource } = $props();
</script>

{#if res.farm?.length}
  <div class="section-title">{t("res.wikiFarm")}</div>
  <div class="nodes">
    {#each res.farm as i (i)}
      {@const s = db.sources[i]}
      <span class="node"><b>{s.name}</b>{#if s.sub}<small>{s.sub}</small>{/if}</span>
    {/each}
  </div>
  <p class="note">
    {t("res.wikiNote")}
    {#if res.wiki}<a href={wikiUrl(res.wiki)} target="_blank" rel="noreferrer">{t("res.wikiOpen")} ↗</a>{/if}
  </p>
{/if}

<style>
  .nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .node {
    display: inline-flex;
    flex-direction: column;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--surface);
    box-shadow: inset 2px 0 0 var(--accent);
    font-size: 13.5px;
  }
  .node b {
    font-weight: 500;
  }
  .node small {
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .note {
    margin: 8px 0 4px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .note a {
    margin-left: 6px;
    color: var(--accent);
  }
</style>
