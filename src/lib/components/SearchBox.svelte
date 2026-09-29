<script lang="ts">
  import { goto } from "$app/navigation";
  import { search, iconUrl, type Entry } from "$lib/db";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";

  let { onpick, autofocus = false }: { onpick?: () => void; autofocus?: boolean } = $props();

  let query = $state("");
  let active = $state(0);
  let input: HTMLInputElement;
  // Mods and arcanes are drawn in their game frames, not as bare art.
  let frames = $state<FramesDb | null>(null);
  loadFrames().then((f) => (frames = f));

  const results = $derived(search(query));
  const KIND_LABEL = { set: "Набор", item: "Предмет", relic: "Реликвия", frame: "Варфрейм", mod: "Мод", arcane: "Мистификатор" } as const;

  $effect(() => {
    query;
    active = 0;
  });

  $effect(() => {
    if (autofocus) input?.focus();
  });

  function href(e: Entry): string {
    // Mods and arcanes have their own page only for the market.
    const route = e.kind === "mod" || e.kind === "arcane" ? "market" : e.kind;
    return `/${route}?id=${encodeURIComponent(e.id)}`;
  }

  function pick(e: Entry) {
    goto(href(e));
    query = "";
    onpick?.();
  }

  function onkeydown(ev: KeyboardEvent) {
    if (ev.key === "ArrowDown") {
      active = Math.min(active + 1, results.length - 1);
      ev.preventDefault();
    } else if (ev.key === "ArrowUp") {
      active = Math.max(active - 1, 0);
      ev.preventDefault();
    } else if (ev.key === "Enter" && results[active]) {
      pick(results[active]);
    }
  }
</script>

<div class="search">
  <input
    bind:this={input}
    bind:value={query}
    {onkeydown}
    placeholder="Сарина прайм, лит s18, nikana..."
    spellcheck="false"
  />
  {#if results.length}
    <ul>
      {#each results as e, i (e.kind + e.id)}
        <li>
          <button class:active={i === active} onmouseenter={() => (active = i)} onclick={() => pick(e)}>
            <span class="thumb">
              {#if e.kind === "mod" && frames?.mods[e.id]}
                <ModCard mod={frames.mods[e.id]} scale={0.22} bare />
              {:else if e.kind === "arcane" && frames?.arcanes[e.id]}
                <ArcaneCard arcane={frames.arcanes[e.id]} scale={0.12} bare />
              {:else}
                <img src={iconUrl(e.icon)} alt="" loading="lazy" />
              {/if}
            </span>
            <span class="name">
              {e.ru}
              <small>{e.en}</small>
            </span>
            {#if e.vaulted}<span class="tag vaulted">в хранилище</span>{/if}
            <span class="kind">{KIND_LABEL[e.kind]}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if query.trim()}
    <p class="empty">Ничего не нашлось</p>
  {/if}
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  input {
    width: 100%;
    padding: 14px 16px;
    font-size: 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    overflow-y: auto;
  }
  li button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 10px;
    border-radius: 8px;
    text-align: left;
  }
  li button.active {
    background: var(--surface-2);
  }
  .thumb {
    width: 64px;
    flex: none;
    display: flex;
    justify-content: center;
  }
  img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  .name small {
    display: block;
    color: var(--text-faint);
    font-size: 12px;
  }
  .kind {
    flex: none;
    color: var(--text-faint);
    font-size: 12px;
    white-space: nowrap;
    text-align: right;
  }
  .empty {
    color: var(--text-faint);
    padding: 12px 4px;
  }
</style>
