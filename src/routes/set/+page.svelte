<script lang="ts">
  import { page } from "$app/state";
  import { getDb, iconUrl, itemName } from "$lib/db";
  import Plat from "$lib/components/Plat.svelte";

  const db = getDb();
  const id = $derived(page.url.searchParams.get("id") ?? "");
  const set = $derived(db.sets[id]);

  const parts = $derived(
    (set?.parts ?? []).map((pid) => {
      const it = db.items[pid];
      const active = it.relics.filter((r) => !db.relics[r.relic].vaulted);
      return { id: pid, it, active: active.length, total: it.relics.length };
    }),
  );
  const ducats = $derived(parts.reduce((s, p) => s + (p.it.ducats ?? 0), 0));
  const vaulted = $derived(parts.length > 0 && parts.every((p) => p.active === 0));
</script>

{#if set}
  <div class="page">
    <header class="hero">
      <img src={iconUrl(set.icon)} alt="" />
      <div>
        <h1>{set.ru}</h1>
        <div class="sub">
          <span>{set.en}</span>
          <span class="tag {vaulted ? 'vaulted' : 'active'}">{vaulted ? "в хранилище" : "выпадает сейчас"}</span>
        </div>
      </div>
      <div class="price">
        <div class="big"><Plat slug={set.slug} /></div>
        <div class="muted">набор целиком</div>
      </div>
    </header>

    <div class="section-title">Части</div>
    <div class="rows">
      {#each parts as p (p.id)}
        <a class="row" href="/item?id={encodeURIComponent(p.id)}">
          <img src={iconUrl(p.it.icon)} alt="" loading="lazy" />
          <span class="name">
            {itemName(p.it)}
            <small>{p.active ? `в ${p.active} активных реликвиях` : "только в хранилище"} · всего {p.total}</small>
          </span>
          <span class="num ducat">{p.it.ducats ?? "—"} д</span>
          <span class="num"><Plat slug={p.it.slug} /></span>
        </a>
      {/each}
    </div>
    <p class="muted total">Дукатов за все части: <span class="ducat">{ducats}</span></p>
  </div>
{:else}
  <div class="page"><p>Набор не найден.</p></div>
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
  .total {
    margin-top: 12px;
    font-size: 13px;
  }
</style>
