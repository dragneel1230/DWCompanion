<script lang="ts">
  // Hub search: the same index as Ctrl+K in the app, results drop down over the widgets.
  // Picking opens the entry in the hub's detail panel (no page navigation in this window).
  import Facts from "$lib/components/Facts.svelte";
  import { labels, t } from "$lib/i18n/index.svelte";
  import { search, iconUrl, type Entry } from "$lib/db";
  import { loadFrames, loadOtherMods, type FramesDb, type Mod } from "$lib/frames";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";

  let { query = $bindable(""), onpick }: { query?: string; onpick: (e: Entry) => void } = $props();

  let input: HTMLInputElement;
  let active = $state(0);
  let focused = $state(false);
  let frames = $state<FramesDb | null>(null);
  loadFrames().then((f) => (frames = f));
  // Weapon, companion, archwing mods and stances.
  let otherMods = $state<Record<string, Mod>>({});
  loadOtherMods().then((m) => (otherMods = m)).catch(() => {});
  const modOf = (id: string): Mod | undefined => frames?.mods[id] ?? otherMods[id];

  const results = $derived(search(query, 12));
  const KIND_LABEL = labels({ set: "kind.set", item: "kind.item", relic: "kind.relic", frame: "kind.frame", mod: "kind.mod", arcane: "kind.arcane", resource: "kind.resource", craft: "kind.craft" });
  const showList = $derived(focused && !!query.trim());

  $effect(() => {
    query;
    active = 0;
  });

  export function focus(selectAll = false) {
    input?.focus();
    if (selectAll) input?.select();
  }
  // Esc: first closes the results, returns false when there was nothing to close.
  export function dismiss(): boolean {
    if (!showList) return false;
    query = "";
    return true;
  }

  function pick(e: Entry) {
    onpick(e);
    input.blur();
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

<div class="search" class:open={showList}>
  <div class="field">
    <svg viewBox="0 0 24 24"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3" /></svg>
    <input
      bind:this={input}
      bind:value={query}
      {onkeydown}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      placeholder={t("search.placeholder")}
      spellcheck="false"
    />
  </div>
  {#if showList}
    <!-- mousedown keeps focus in the input until the click lands -->
    <div class="list" role="presentation" onmousedown={(e) => e.preventDefault()}>
      {#each results as e, i (e.kind + e.id)}
        <button class:active={i === active} onmouseenter={() => (active = i)} onclick={() => pick(e)}>
          <span class="thumb">
            {#if e.kind === "mod" && modOf(e.id)}
              <ModCard mod={modOf(e.id)!} scale={0.2} bare />
            {:else if e.kind === "arcane" && frames?.arcanes[e.id]}
              <ArcaneCard arcane={frames.arcanes[e.id]} scale={0.11} bare />
            {:else}
              <img src={iconUrl(e.icon)} alt="" loading="lazy" />
            {/if}
          </span>
          <span class="name">{e.name}{#if e.name !== e.en}<small>{e.en}</small>{/if}</span>
          <Facts kind={e.kind} id={e.id} slug={e.kind === "mod" ? modOf(e.id)?.slug : e.kind === "arcane" ? frames?.arcanes[e.id]?.slug : undefined} />
          {#if e.vaulted}<span class="tag vaulted">{t("tag.inVault")}</span>{/if}
          <span class="kind">{KIND_LABEL[e.kind]}</span>
        </button>
      {:else}
        <p class="none">{t("search.none")}</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: min(760px, 100%);
    margin: 0 auto;
    z-index: 5;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 58px;
    padding: 0 20px;
    border-radius: 18px;
    background: var(--glass);
    border: 1px solid var(--glass-line);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    transition: border-color 0.15s;
  }
  .search:focus-within .field {
    border-color: rgba(201, 166, 107, 0.55);
  }
  .open .field {
    border-radius: 18px 18px 0 0;
  }
  svg {
    width: 20px;
    height: 20px;
    flex: none;
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  input {
    flex: 1;
    height: 100%;
    background: none;
    border: none;
    outline: none;
    font-size: 17px;
  }
  input::placeholder {
    color: var(--text-faint);
  }
  .list {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    max-height: 60vh;
    overflow-y: auto;
    padding: 6px;
    border-radius: 0 0 18px 18px;
    background: var(--bg);
    border: 1px solid rgba(201, 166, 107, 0.55);
    border-top-color: var(--glass-line);
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5);
  }
  .list button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-radius: 10px;
    text-align: left;
  }
  .list button.active {
    background: var(--surface-2);
  }
  .thumb {
    width: 60px;
    flex: none;
    display: flex;
    justify-content: center;
  }
  img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .name {
    flex: 1;
    min-width: 0;
  }
  .name small {
    display: block;
    font-size: 12px;
    color: var(--text-faint);
  }
  .kind {
    flex: none;
    font-size: 12px;
    color: var(--text-faint);
  }
  .none {
    margin: 0;
    padding: 12px;
    color: var(--text-faint);
  }
</style>
