<script lang="ts">
  import { loadFrames, searchFrames, buildsFor, type FramesDb } from "$lib/frames";
  import { iconUrl } from "$lib/db";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  type Filter = "all" | "prime" | "base";
  let query = $state("");
  let filter = $state<Filter>("all");

  const list = $derived(
    db ? searchFrames(db, query).filter(([, f]) => filter === "all" || f.prime === (filter === "prime")) : [],
  );
</script>

<div class="page wide">
  <div class="head">
    <h1>Варфреймы</h1>
    <div class="modes">
      <button class:on={filter === "all"} onclick={() => (filter = "all")}>Все</button>
      <button class:on={filter === "prime"} onclick={() => (filter = "prime")}>Прайм</button>
      <button class:on={filter === "base"} onclick={() => (filter = "base")}>Обычные</button>
    </div>
  </div>

  <!-- svelte-ignore a11y_autofocus -->
  <input class="find" bind:value={query} placeholder="Найти варфрейм: сарина, mesa, вольт..." spellcheck="false" autofocus />

  {#if db}
    <div class="grid">
      {#each list as [id, f] (id)}
        {@const n = buildsFor(db, id).length}
        <a class="frame" href="/frame?id={encodeURIComponent(id)}">
          <img src={iconUrl(f.icon)} alt="" loading="lazy" />
          <span class="name">{f.ru}</span>
          <span class="meta">{n ? `билдов: ${n}` : f.en}</span>
        </a>
      {/each}
    </div>
    {#if !list.length}<p class="muted">Ничего не нашлось</p>{/if}
  {/if}
</div>

<style>
  .wide {
    max-width: 1100px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0;
  }
  .modes {
    display: flex;
    gap: 4px;
    background: var(--surface);
    padding: 3px;
    border-radius: 10px;
  }
  .modes button {
    padding: 6px 12px;
    border-radius: 8px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .modes button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .find {
    width: 100%;
    margin: 18px 0 20px;
    padding: 12px 14px;
    font-size: 15px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    outline: none;
  }
  .find:focus {
    border-color: var(--accent);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
    gap: 10px;
  }
  .frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px 10px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid transparent;
    text-align: center;
  }
  .frame:hover {
    border-color: var(--line);
    background: var(--surface-2);
  }
  .frame img {
    width: 84px;
    height: 84px;
    object-fit: contain;
  }
  .name {
    font-size: 13px;
  }
  .meta {
    font-size: 11px;
    color: var(--text-faint);
  }
</style>
