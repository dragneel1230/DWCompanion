<script lang="ts">
  import { page } from "$app/state";
  import { getDb, iconUrl, itemName, RARITY_RU } from "$lib/db";
  import type { Price } from "$lib/api";
  import Plat from "$lib/components/Plat.svelte";
  import Cur from "$lib/components/Cur.svelte";

  const db = getDb();
  const id = $derived(page.url.searchParams.get("id") ?? "");
  const relic = $derived(db.relics[id]);

  let prices = $state<Record<string, number>>({});
  $effect(() => {
    id;
    prices = {};
  });

  // Highlight the reward worth the most platinum once prices arrive.
  const best = $derived.by(() => {
    let top: string | null = null;
    for (const [rid, p] of Object.entries(prices)) if (!top || p > prices[top]) top = rid;
    return top;
  });

  function onprice(rid: string, p: Price | null) {
    if (p?.sell != null) prices[rid] = p.sell;
  }
</script>

{#if relic}
  <div class="page">
    <header class="hero">
      <img src={iconUrl(relic.icon)} alt="" />
      <div>
        <h1>{relic.ru}</h1>
        <div class="sub">
          <span>{relic.en}</span>
          <span class="tag {relic.vaulted ? 'vaulted' : 'active'}">{relic.vaulted ? "в хранилище" : "выпадает сейчас"}</span>
        </div>
      </div>
      <div class="price">
        <div class="big"><Plat slug={relic.slug} size={22} /></div>
        <div class="muted">реликвия (интакт)</div>
      </div>
    </header>

    <div class="section-title">Награды</div>
    <div class="rows">
      {#each relic.rewards as rw (rw.id)}
        {@const it = db.items[rw.id]}
        <a class="row" class:best={best === rw.id} href="/item?id={encodeURIComponent(rw.id)}">
          <img src={iconUrl(it.icon)} alt="" loading="lazy" />
          <span class="name">
            {rw.count > 1 ? `${rw.count} × ` : ""}{itemName(it)}
            <small class="rarity-{rw.rarity}">{RARITY_RU[rw.rarity]}</small>
          </span>
          <span class="num">{#if it.ducats}<Cur kind="ducats" value={it.ducats} />{/if}</span>
          <span class="num"><Plat slug={it.slug} onprice={(p) => onprice(rw.id, p)} /></span>
        </a>
      {/each}
    </div>
  </div>
{:else}
  <div class="page"><p>Реликвия не найдена.</p></div>
{/if}

<style>
  .price {
    margin-left: auto;
    text-align: right;
  }
  .big {
    font-size: 22px;
    font-weight: 600;
  }
  .ducat {
    color: var(--ducat);
  }
</style>
