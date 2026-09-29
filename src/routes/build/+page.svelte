<script lang="ts">
  import { page } from "$app/state";
  import { loadFrames, POLARITY_RU, RARITY_RU, type FramesDb, type Mod, type Arcane } from "$lib/frames";
  import { iconUrl } from "$lib/db";
  import { owned } from "$lib/owned.svelte";
  import ModCard from "$lib/components/ModCard.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const build = $derived(db?.builds[id]);
  const frame = $derived(build && db ? db.frames[build.frame] : null);

  type Line = { id: string; kind: "mod" | "arcane"; slot: string; mod?: Mod; arcane?: Arcane };

  // Everything the build needs, in grid order, for the "do I have it" list.
  const lines = $derived.by<Line[]>(() => {
    if (!build || !db) return [];
    const out: Line[] = [];
    const addMod = (mid: string | null, slot: string) => mid && out.push({ id: mid, kind: "mod", slot, mod: db!.mods[mid] });
    addMod(build.aura, "Аура");
    addMod(build.exilus, "Эксилус");
    build.slots.forEach((m, i) => addMod(m, `Слот ${i + 1}`));
    build.arcanes.forEach((a, i) => out.push({ id: a, kind: "arcane", slot: `Мистификатор ${i + 1}`, arcane: db!.arcanes[a] }));
    return out;
  });

  const have = $derived(lines.filter((l) => owned.has(l.id)).length);
  const ring = $derived(lines.length ? have / lines.length : 0);

  function focus(lid: string) {
    document.getElementById(`line-${lid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
</script>

{#if build && frame && db}
  <div class="page">
    <header class="hero">
      <a href="/frame?id={encodeURIComponent(build.frame)}"><img src={iconUrl(frame.icon)} alt="" /></a>
      <div>
        <h1>{build.title}</h1>
        <div class="sub">
          <a class="frame-link" href="/frame?id={encodeURIComponent(build.frame)}">{frame.ru}</a>
          <span>· {build.author}</span>
          <span>· ▲ {build.votes}</span>
          {#each build.tags as t}<span class="tag">{t}</span>{/each}
        </div>
      </div>
    </header>

    {#if build.demo || build.note}
      <p class="note" class:demo={build.demo}>{build.note}</p>
    {/if}

    <section class="board">
      <div class="top">
        <ModCard mod={build.aura ? db.mods[build.aura] : null} label="Аура" owned={!!build.aura && owned.has(build.aura)} onclick={() => build.aura && focus(build.aura)} />
        <ModCard mod={build.exilus ? db.mods[build.exilus] : null} label="Эксилус" owned={!!build.exilus && owned.has(build.exilus)} onclick={() => build.exilus && focus(build.exilus)} />
      </div>
      <div class="slots">
        {#each build.slots as m, i (i)}
          <ModCard mod={m ? db.mods[m] : null} owned={!!m && owned.has(m)} onclick={() => m && focus(m)} />
        {/each}
      </div>
      {#if build.arcanes.length}
        <div class="top arcanes">
          {#each build.arcanes as a (a)}
            <ModCard arcane={db.arcanes[a]} label="Мистиф." owned={owned.has(a)} onclick={() => focus(a)} />
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
            <img src={iconUrl(item.icon)} alt="" loading="lazy" />
            <span class="name">
              {item.ru}
              <small>
                {l.slot} · {RARITY_RU[item.rarity]}
                {#if l.mod}· <img class="pol" src="/icons/{l.mod.pol}.png" alt="" /> {POLARITY_RU[l.mod.pol]}{/if}
              </small>
              <span class="stats">{item.stats}</span>
            </span>
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
    grid-template-columns: repeat(4, 118px);
    gap: 12px;
  }
  .arcanes {
    margin-top: 4px;
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
  .line > img {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 6px;
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
