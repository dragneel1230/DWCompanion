<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { loadFrames, getBuild, formaInfo, buildEndo, rankOf, POLARITY_RU, RARITY_RU, type Build, type FramesDb, type Mod, type Arcane, type Polarity } from "$lib/frames";
  import { userBuilds } from "$lib/userBuilds.svelte";
  import { iconUrl } from "$lib/db";
  import { owned } from "$lib/owned.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import BuildBoard from "$lib/components/BuildBoard.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const build = $derived(db ? getBuild(db, id) : undefined);
  const frame = $derived(build && db ? db.frames[build.frame] : null);
  const own = $derived(!!userBuilds.all[id]);

  // Read-only copy for the board (it takes a bindable build).
  let view = $state<Build | null>(null);
  $effect(() => {
    view = build ? $state.snapshot(build) : null;
  });

  const forma = $derived(frame && build ? formaInfo(frame, build.pols).count : 0);
  const endo = $derived(db && build ? buildEndo(db, build) : 0);
  const editUrl = $derived(build ? `/frame?id=${encodeURIComponent(build.frame)}&build=${encodeURIComponent(id)}` : "");

  function remove() {
    if (!build) return;
    const frameId = build.frame;
    userBuilds.remove(id);
    goto(`/frame?id=${encodeURIComponent(frameId)}`);
  }

  type Line = { id: string; kind: "mod" | "arcane"; slot: string; mod?: Mod; arcane?: Arcane; pol?: Polarity | null; rank?: number };

  // Everything the build needs, in grid order, for the "do I have it" list.
  const lines = $derived.by<Line[]>(() => {
    if (!build || !db) return [];
    const out: Line[] = [];
    const p = build.pols;
    const r = build.ranks;
    const addMod = (mid: string | null, slot: string, pol?: Polarity | null, rank?: number | null) =>
      mid && db!.mods[mid] && out.push({ id: mid, kind: "mod", slot, mod: db!.mods[mid], pol, rank: rankOf(db!.mods[mid], rank) });
    addMod(build.aura, "Аура", p?.aura, r?.aura);
    addMod(build.exilus, "Эксилус", p?.exilus, r?.exilus);
    build.slots.forEach((m, i) => addMod(m, `Слот ${i + 1}`, p?.slots[i], r?.slots[i]));
    build.arcanes.forEach((a, i) => db!.arcanes[a] && out.push({ id: a, kind: "arcane", slot: `Мистификатор ${i + 1}`, arcane: db!.arcanes[a] }));
    return out;
  });

  const have = $derived(lines.filter((l) => owned.has(l.id)).length);
  const ring = $derived(lines.length ? have / lines.length : 0);
</script>

{#if build && frame && db && view}
  <div class="page wide">
    <header class="top">
      <a href="/frame?id={encodeURIComponent(build.frame)}"><img class="portrait" src={iconUrl(frame.icon)} alt="" /></a>
      <div class="head">
        <div class="title-row">
          <div>
            <h1>{build.title}</h1>
            <div class="sub">
              <a class="frame-link" href="/frame?id={encodeURIComponent(build.frame)}">{frame.ru}</a>
              <span>· {build.author}</span>
              {#if build.source !== "overframe" && !own}<span>· ▲ {build.votes}</span>{/if}
              {#each build.tags as t}<span class="tag">{t}</span>{/each}
            </div>
          </div>
          <div class="actions">
            {#if build.url}<a class="act" href={build.url} target="_blank" rel="noreferrer">Overframe ↗</a>{/if}
            {#if own}<button class="act danger" onclick={remove}>Удалить</button>{/if}
            <a class="act primary" href={editUrl}>{own ? "Изменить" : "Скопировать и изменить"}</a>
          </div>
        </div>
        <div class="costs">
          <span title="Форм нужно (изменённые полярности)"><img src="/icons/forma.png" alt="Форма" /> {forma}</span>
          <span title="Эндо на прокачку всех модов с 0"><img src="/icons/endo.png" alt="Эндо" /> {endo.toLocaleString("ru-RU")}</span>
        </div>
        {#if build.demo || build.note}
          <p class="note" class:demo={build.demo}>{build.note}</p>
        {/if}
      </div>
    </header>

    <BuildBoard {db} {frame} bind:build={view} />

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
              {#if l.mod}<ModCard mod={l.mod} slotPol={l.pol} rank={l.rank} scale={0.4} bare />{:else if l.arcane}<ArcaneCard arcane={l.arcane} scale={0.23} bare />{/if}
            </div>
            <span class="name">
              {item.ru}
              <small>
                {l.slot} · {RARITY_RU[item.rarity]}
                {#if l.mod}· <img class="pol" src="/icons/{l.mod.pol}.png" alt="" /> {POLARITY_RU[l.mod.pol]} · ранг {l.rank} / {l.mod.max}{/if}
              </small>
              <span class="stats">{l.mod ? (l.mod.levels[l.rank ?? l.mod.max] ?? item.stats) : item.stats}</span>
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
    max-width: 1180px;
  }
  .top {
    display: flex;
    gap: 22px;
    margin-bottom: 20px;
  }
  .portrait {
    width: 150px;
    height: 150px;
    object-fit: contain;
    flex: none;
    filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.5));
  }
  .head {
    flex: 1;
    min-width: 0;
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 26px;
    font-weight: 600;
    color: var(--plat);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    color: var(--text-dim);
    font-size: 13px;
  }
  .frame-link {
    color: var(--accent);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    flex: none;
  }
  .act {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--text-dim);
    font-size: 13px;
  }
  .act.primary {
    color: var(--bg);
    background: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }
  .act.danger:hover {
    color: var(--warn);
  }
  .costs {
    display: flex;
    gap: 16px;
    margin: 12px 0 6px;
    font-weight: 600;
  }
  .costs span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .costs img {
    width: 20px;
    height: 20px;
  }
  .note {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .note.demo {
    color: var(--warn);
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
