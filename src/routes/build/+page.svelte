<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { loadFrames, getBuild, modCost, BASE_CAPACITY, POLARITY_RU, RARITY_RU, type FramesDb, type Mod, type Arcane, type Polarity } from "$lib/frames";
  import { userBuilds } from "$lib/userBuilds.svelte";
  import { iconUrl } from "$lib/db";
  import { owned } from "$lib/owned.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const build = $derived(db ? getBuild(db, id) : undefined);

  function remove() {
    if (!build) return;
    const frameId = build.frame;
    userBuilds.remove(id);
    goto(`/frame?id=${encodeURIComponent(frameId)}`);
  }
  const frame = $derived(build && db ? db.frames[build.frame] : null);

  type Line = { id: string; kind: "mod" | "arcane"; slot: string; mod?: Mod; arcane?: Arcane; pol?: Polarity | null };

  // Everything the build needs, in grid order, for the "do I have it" list.
  const lines = $derived.by<Line[]>(() => {
    if (!build || !db) return [];
    const out: Line[] = [];
    const p = build.pols;
    const addMod = (mid: string | null, slot: string, pol?: Polarity | null) =>
      mid && out.push({ id: mid, kind: "mod", slot, mod: db!.mods[mid], pol });
    addMod(build.aura, "Аура", p?.aura);
    addMod(build.exilus, "Эксилус", p?.exilus);
    build.slots.forEach((m, i) => addMod(m, `Слот ${i + 1}`, p?.slots[i]));
    build.arcanes.forEach((a, i) => out.push({ id: a, kind: "arcane", slot: `Мистификатор ${i + 1}`, arcane: db!.arcanes[a] }));
    return out;
  });

  // Capacity like the in-game counter: 60 with reactor + aura bonus, minus every mod's drain.
  const capacity = $derived.by(() => {
    if (!build || !db) return null;
    const p = build.pols;
    const auraMod = build.aura ? db.mods[build.aura] : null;
    const total = BASE_CAPACITY + (auraMod ? -modCost(auraMod, p?.aura) : 0);
    let used = build.exilus ? modCost(db.mods[build.exilus], p?.exilus) : 0;
    build.slots.forEach((m, i) => m && (used += modCost(db!.mods[m], p?.slots[i])));
    return { used, total };
  });

  const have = $derived(lines.filter((l) => owned.has(l.id)).length);
  const ring = $derived(lines.length ? have / lines.length : 0);

  function focus(lid: string) {
    document.getElementById(`line-${lid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
</script>

{#if build && frame && db}
  <div class="page wide">
    <header class="hero">
      <a href="/frame?id={encodeURIComponent(build.frame)}"><img src={iconUrl(frame.icon)} alt="" /></a>
      <div>
        <h1>{build.title}</h1>
        <div class="sub">
          <a class="frame-link" href="/frame?id={encodeURIComponent(build.frame)}">{frame.ru}</a>
          <span>· {build.author}</span>
          {#if build.source !== "overframe"}<span>· ▲ {build.votes}</span>{/if}
          {#each build.tags as t}<span class="tag">{t}</span>{/each}
        </div>
      </div>
    </header>

    {#if build.source === "overframe"}
      <div class="actions">
        {#if build.url}<a class="act" href={build.url} target="_blank" rel="noreferrer">Открыть на Overframe ↗</a>{/if}
        <button class="act danger" onclick={remove}>Удалить импорт</button>
      </div>
    {/if}

    {#if build.demo || build.note}
      <p class="note" class:demo={build.demo}>{build.note}</p>
    {/if}

    <section class="board">
      {#if capacity}
        <div class="capacity" class:over={capacity.used > capacity.total}>
          Вместимость <b>{capacity.used}</b> / {capacity.total}
          {#if !build.pols}<span class="muted" title="Полярности слотов неизвестны — стоимость без форм">· без форм</span>{/if}
        </div>
      {/if}
      <div class="top">
        <ModCard mod={build.aura ? db.mods[build.aura] : null} slotPol={build.pols?.aura} label="Аура" owned={!!build.aura && owned.has(build.aura)} onclick={() => build.aura && focus(build.aura)} />
        <ModCard mod={build.exilus ? db.mods[build.exilus] : null} slotPol={build.pols?.exilus} label="Эксилус" owned={!!build.exilus && owned.has(build.exilus)} onclick={() => build.exilus && focus(build.exilus)} />
      </div>
      <div class="slots">
        {#each build.slots as m, i (i)}
          <ModCard mod={m ? db.mods[m] : null} slotPol={build.pols?.slots[i]} owned={!!m && owned.has(m)} onclick={() => m && focus(m)} />
        {/each}
      </div>
      {#if build.arcanes.length}
        <div class="top arcanes">
          {#each build.arcanes as a (a)}
            <ArcaneCard arcane={db.arcanes[a]} owned={owned.has(a)} onclick={() => focus(a)} />
          {/each}
        </div>
      {/if}
    </section>

    <div class="have-head">
      <div class="section-title">Моды билда</div>
      <div class="have" title="Сколько модов из билда у тебя есть">
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" class="track" />
          <circle cx="18" cy="18" r="15" class="fill" style:stroke-dasharray="{ring * 94.25} 94.25" />
        </svg>
        <span>Есть <b>{have}</b> из {lines.length}</span>
      </div>
    </div>
    <p class="hint">
      Пока отметки ручные: нажми «Есть», и они сохранятся для всех билдов. Когда DE подтвердят разрешённый
      способ читать инвентарь, проверка станет автоматической.
    </p>

    <div class="rows">
      {#each lines as l (l.slot)}
        {@const item = l.mod ?? l.arcane}
        {#if item}
          {@const has = owned.has(l.id)}
          <div class="row line" id="line-{l.id}">
            <div class="thumb">
              {#if l.mod}<ModCard mod={l.mod} slotPol={l.pol} scale={0.4} bare />{:else if l.arcane}<ArcaneCard arcane={l.arcane} scale={0.23} bare />{/if}
            </div>
            <span class="name">
              {item.ru}
              <small>
                {l.slot} · {RARITY_RU[item.rarity]}
                {#if l.mod}· <img class="pol" src="/icons/{l.mod.pol}.png" alt="" /> {POLARITY_RU[l.mod.pol]}{/if}
              </small>
              <span class="stats">{item.stats}</span>
            </span>
            {#if item.slug}<a class="market" href="/market?id={encodeURIComponent(l.id)}" title="Заявки на warframe.market">Рынок</a>{/if}
            <button class="own" class:yes={has} onclick={() => owned.toggle(l.id)}>{has ? "✓ Есть" : "Нет"}</button>
          </div>
        {/if}
      {/each}
    </div>
  </div>
{:else if db}
  <div class="page"><p>Билд не найден.</p></div>
{/if}

<style>
  .wide {
    max-width: 1000px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin: -8px 0 18px;
  }
  .act {
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
  }
  .act.danger:hover {
    color: var(--warn);
  }
  .frame-link {
    color: var(--accent);
  }
  .note {
    margin: -8px 0 18px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .note.demo {
    color: var(--warn);
  }
  .board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px;
    border-radius: 14px;
    background: radial-gradient(ellipse at 50% 0%, rgba(201, 166, 107, 0.07), transparent 60%), var(--surface);
  }
  .top {
    display: flex;
    gap: 12px;
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(4, 210px);
    gap: 6px 12px;
  }
  .capacity {
    align-self: flex-end;
    font-size: 13px;
    color: var(--text-dim);
  }
  .capacity b {
    color: var(--good);
    font-weight: 600;
  }
  .capacity.over b {
    color: #ff7b6b;
  }
  .arcanes {
    margin-top: 10px;
    gap: 40px;
  }
  .have-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
  }
  .have {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .have b {
    color: var(--text);
  }
  .have svg {
    width: 30px;
    height: 30px;
    transform: rotate(-90deg);
  }
  .have circle {
    fill: none;
    stroke-width: 3.5;
  }
  .have .track {
    stroke: var(--line);
  }
  .have .fill {
    stroke: var(--good);
    stroke-linecap: round;
    transition: stroke-dasharray 0.3s;
  }
  .hint {
    margin: 0 0 12px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .line {
    align-items: flex-start;
  }
  .thumb {
    flex: none;
    width: 118px;
    display: flex;
    justify-content: center;
    align-self: center;
  }
  .line small {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pol {
    width: 12px;
    height: 12px;
  }
  .stats {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-dim);
    white-space: pre-line;
  }
  .market {
    flex: none;
    align-self: center;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    color: var(--plat);
    background: rgba(143, 184, 255, 0.1);
  }
  .own {
    flex: none;
    align-self: center;
    min-width: 74px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
    font-size: 12px;
  }
  .own.yes {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.4);
    background: rgba(111, 207, 151, 0.08);
  }
</style>
