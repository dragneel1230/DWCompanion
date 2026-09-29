<script lang="ts">
  // Market page for a mod or arcane (prime parts, sets and relics have it on their own pages).
  import { page } from "$app/state";
  import { loadFrames, RARITY_RU, type FramesDb } from "$lib/frames";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import MarketPanel from "$lib/components/MarketPanel.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const mod = $derived(db?.mods[id]);
  const arcane = $derived(db?.arcanes[id]);
  const item = $derived(mod ?? arcane);
</script>

{#if item}
  <div class="page">
    <header class="hero">
      <div class="card">
        {#if mod}<ModCard {mod} scale={0.5} bare />{:else if arcane}<ArcaneCard {arcane} scale={0.3} bare />{/if}
      </div>
      <div>
        <h1>{item.ru}</h1>
        <div class="sub">
          <span>{item.en}</span>
          <span class="tag">{mod ? "мод" : "мистификатор"} · {RARITY_RU[item.rarity]}</span>
        </div>
        <p class="stats">{item.stats}</p>
      </div>
    </header>

    {#if item.slug}
      <MarketPanel slug={item.slug} item={{ en: item.mname ?? item.en, ru: item.ru }} maxRank={item.max} />
    {:else}
      <p class="muted">Этот предмет не продаётся на warframe.market.</p>
    {/if}
  </div>
{:else if db}
  <div class="page"><p>Предмет не найден.</p></div>
{/if}

<style>
  .card {
    flex: none;
  }
  .stats {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-dim);
    white-space: pre-line;
  }
</style>
