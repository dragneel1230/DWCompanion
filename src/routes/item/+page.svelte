<script lang="ts">
  import { page } from "$app/state";
  import { getDb, iconUrl, itemName, RARITY_RU } from "$lib/db";
  import Plat from "$lib/components/Plat.svelte";

  const db = getDb();
  const id = $derived(page.url.searchParams.get("id") ?? "");
  const item = $derived(db.items[id]);
  const set = $derived(item?.set ? db.sets[item.set] : null);

  const ERA_ORDER: Record<string, number> = { Lith: 0, Meso: 1, Neo: 2, Axi: 3, Requiem: 4, Vanguard: 5 };
  const RARITY_ORDER = { RARE: 0, UNCOMMON: 1, COMMON: 2 };

  const relics = $derived(
    (item?.relics ?? [])
      .map((r) => ({ key: r.relic, rarity: r.rarity, relic: db.relics[r.relic] }))
      .sort(
        (a, b) =>
          Number(a.relic.vaulted) - Number(b.relic.vaulted) ||
          ERA_ORDER[a.relic.era] - ERA_ORDER[b.relic.era] ||
          RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity],
      ),
  );
  const active = $derived(relics.filter((r) => !r.relic.vaulted));
  const vaulted = $derived(relics.filter((r) => r.relic.vaulted));
</script>

{#snippet relicRow(r: (typeof relics)[number])}
  <a class="row" href="/relic?id={encodeURIComponent(r.key)}">
    <img src={iconUrl(r.relic.icon)} alt="" loading="lazy" />
    <span class="name">{r.relic.ru}</span>
    <span class="rarity-{r.rarity}">{RARITY_RU[r.rarity]}</span>
    <span class="num"><Plat slug={r.relic.slug} /></span>
  </a>
{/snippet}

{#if item}
  <div class="page">
    <header class="hero">
      <img src={iconUrl(item.icon)} alt="" />
      <div>
        <h1>{itemName(item)}</h1>
        <div class="sub">
          <span>{item.en}</span>
          {#if set}<a class="tag" href="/set?id={encodeURIComponent(item.set ?? '')}">набор: {set.ru}</a>{/if}
        </div>
      </div>
      <div class="price">
        <div class="big"><Plat slug={item.slug} /></div>
        {#if item.ducats}<div class="ducat">{item.ducats} дукатов</div>{/if}
      </div>
    </header>

    <div class="section-title">Выпадает сейчас · {active.length}</div>
    {#if active.length}
      <div class="rows">
        {#each active as r (r.key)}{@render relicRow(r)}{/each}
      </div>
    {:else}
      <p class="muted">Ни в одной активной реликвии — только в хранилище или у Варзии.</p>
    {/if}

    {#if vaulted.length}
      <div class="section-title">В хранилище · {vaulted.length}</div>
      <div class="rows dim">
        {#each vaulted as r (r.key)}{@render relicRow(r)}{/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="page"><p>Предмет не найден.</p></div>
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
  .dim {
    opacity: 0.65;
  }
  .rows .rarity-RARE,
  .rows .rarity-UNCOMMON,
  .rows .rarity-COMMON {
    width: 90px;
    font-size: 12px;
  }
</style>
