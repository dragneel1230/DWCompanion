<script lang="ts">
  // Slot editor: search a mod / arcane by Russian or English name, set the rank, or clear the slot.
  import { normalize } from "$lib/db";
  import { modsForSlot, rankOf, type Arcane, type Frame, type FramesDb, type Mod } from "$lib/frames";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";
  import ModTooltip from "./ModTooltip.svelte";
  import FloatTip from "./FloatTip.svelte";

  let {
    db,
    frame,
    kind,
    title,
    current,
    rank,
    used,
    onpick,
    onrank,
    onclose,
  }: {
    db: FramesDb;
    frame: Frame;
    kind: "aura" | "exilus" | "slot" | "arcane";
    title: string;
    current: string | null;
    rank: number | null;
    used: Set<string>; // already in the build (the game allows each mod once)
    onpick: (id: string | null) => void;
    onrank: (rank: number) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let hover = $state<{ el: HTMLElement; mod: Mod } | null>(null);

  const list = $derived.by<[string, Mod | Arcane][]>(() => {
    const all: [string, Mod | Arcane][] =
      kind === "arcane"
        ? Object.entries(db.arcanes)
            .filter(([, a]) => a.wf)
            .sort(([, a], [, b]) => a.ru.localeCompare(b.ru, "ru"))
        : modsForSlot(db, frame, kind);
    // Every word must match, in any order ("умбра сил" finds "Усиление Умбра").
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter(([, m]) => {
      const hay = `${normalize(m.ru)} ${normalize(m.en)}`;
      return words.every((w) => hay.includes(w));
    });
  });

  const cur = $derived(current ? (kind === "arcane" ? db.arcanes[current] : db.mods[current]) : null);
  const curRank = $derived(cur && kind !== "arcane" ? rankOf(cur as Mod, rank) : 0);

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
    if (e.key === "Enter" && list.length) onpick(list[0][0]);
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <b>{title}</b>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </div>

    {#if cur}
      <div class="current">
        <span class="cname">{cur.ru}</span>
        {#if kind !== "arcane"}
          {@const m = cur as Mod}
          <div class="stepper" title="Ранг мода">
            <button onclick={() => onrank(Math.max(0, curRank - 1))} disabled={curRank <= 0}>−</button>
            <span>Ранг <b>{curRank}</b> / {m.max}</span>
            <button onclick={() => onrank(Math.min(m.max, curRank + 1))} disabled={curRank >= m.max}>+</button>
          </div>
        {/if}
        <button class="clear" onclick={() => onpick(null)}>Убрать</button>
      </div>
    {/if}

    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={query} placeholder="Поиск по названию (рус. или англ.)" spellcheck="false" autofocus />

    <div class="grid" class:arcanes={kind === "arcane"}>
      {#each list as [id, item] (id)}
        {@const taken = used.has(id) && id !== current}
        <button class="pick" class:taken class:on={id === current} disabled={taken} onclick={() => onpick(id)} title={taken ? "Уже стоит в билде" : undefined}>
          {#if kind === "arcane"}
            <ArcaneCard arcane={item as Arcane} scale={0.2} bare />
            <span class="aname">{item.ru}</span>
            <span class="astats">{item.stats}</span>
          {:else}
            <ModCard mod={item as Mod} scale={0.62} bare onhover={(el) => (hover = el ? { el, mod: item as Mod } : null)} />
          {/if}
        </button>
      {:else}
        <p class="muted">Ничего не нашлось.</p>
      {/each}
    </div>
  </div>
</div>

<FloatTip anchor={hover?.el ?? null}>
  {#if hover}<ModTooltip {db} mod={hover.mod} rank={hover.mod.max} scale={0.72} />{/if}
</FloatTip>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(5, 6, 9, 0.6);
    display: grid;
    place-items: center;
  }
  .dialog {
    width: min(900px, calc(100vw - 40px));
    height: min(680px, calc(100vh - 60px));
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .x {
    color: var(--text-dim);
    font-size: 16px;
  }
  .current {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--surface-2);
  }
  .cname {
    flex: 1;
    font-weight: 600;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .stepper b {
    color: var(--text);
  }
  .stepper button {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid var(--line);
  }
  .stepper button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .clear {
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
  }
  .clear:hover {
    color: var(--warn);
  }
  input {
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--bg);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(186px, 1fr));
    gap: 6px;
    align-content: start;
    justify-items: center;
  }
  .grid.arcanes {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    justify-items: stretch;
  }
  .pick {
    padding: 4px;
    border-radius: 10px;
    border: 1px solid transparent;
  }
  .pick:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .pick.on {
    border-color: var(--accent);
  }
  .pick.taken {
    opacity: 0.3;
    cursor: default;
  }
  .grid.arcanes .pick {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;
    column-gap: 10px;
    text-align: left;
    align-items: start;
  }
  .grid.arcanes .pick :global(.arcane) {
    grid-row: span 2;
  }
  .aname {
    font-weight: 600;
    font-size: 13px;
  }
  .astats {
    font-size: 11px;
    color: var(--text-dim);
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
