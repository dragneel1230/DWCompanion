<script lang="ts">
  import { page } from "$app/state";
  import { loadFrames, buildsFor, POLARITY_RU, type FramesDb } from "$lib/frames";
  import { iconUrl } from "$lib/db";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const frame = $derived(db?.frames[id]);
  const builds = $derived(db ? buildsFor(db, id) : []);

  let openAbility = $state<number | null>(null);

  const STATS = [
    ["health", "Здоровье"],
    ["shield", "Щиты"],
    ["armor", "Броня"],
    ["energy", "Энергия"],
    ["sprint", "Скорость"],
  ] as const;
</script>

{#if frame && db}
  <div class="page">
    <header class="hero">
      <img src={iconUrl(frame.icon)} alt="" />
      <div>
        <h1>{frame.ru}</h1>
        <div class="sub">
          <span>{frame.en}</span>
          {#if frame.prime}<span class="tag prime">прайм</span>{/if}
        </div>
      </div>
    </header>

    <div class="stats">
      {#each STATS as [key, label]}
        <div class="stat"><b>{key === "sprint" ? frame.sprint.toFixed(2).replace(".", ",") : frame[key]}</b><span>{label}</span></div>
      {/each}
      <div class="stat pols">
        <b>
          {#if frame.aura}<img src="/icons/{frame.aura}.png" alt="" title="Аура: {POLARITY_RU[frame.aura]}" />{/if}
          {#each frame.polarities as p}<img src="/icons/{p}.png" alt="" title={POLARITY_RU[p]} />{/each}
          {#if !frame.aura && !frame.polarities.length}—{/if}
        </b>
        <span>Полярности</span>
      </div>
    </div>

    <div class="section-title">Способности</div>
    <div class="abilities">
      {#each frame.abilities as a, i}
        <button class="ability" class:on={openAbility === i} onclick={() => (openAbility = openAbility === i ? null : i)}>
          <img src={iconUrl(a.icon)} alt="" />
          <span>{a.ru}</span>
        </button>
      {/each}
    </div>
    {#if openAbility != null}
      <p class="desc">{frame.abilities[openAbility].desc}</p>
    {/if}
    {#if frame.passive}
      <p class="desc passive"><b>Пассивка.</b> {frame.passive}</p>
    {/if}

    <div class="section-title">Билды · сначала популярные</div>
    {#if builds.length}
      <div class="rows">
        {#each builds as [bid, b] (bid)}
          <a class="row build" href="/build?id={encodeURIComponent(bid)}">
            <span class="name">
              {b.title}
              <small>{b.author}{#each b.tags as t}<span class="tag">{t}</span>{/each}</small>
            </span>
            {#if b.demo}<span class="tag vaulted">демо</span>{/if}
            <span class="votes" title="Голоса">▲ {b.votes}</span>
          </a>
        {/each}
      </div>
    {:else}
      <p class="muted">Билдов пока нет. Источник билдов ещё не выбран — см. раздел «Билды» в docs/DESIGN.md.</p>
    {/if}
  </div>
{:else if db}
  <div class="page"><p>Варфрейм не найден.</p></div>
{/if}

<style>
  .tag.prime {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.35);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    min-width: 92px;
    border-radius: 10px;
    background: var(--surface);
  }
  .stat b {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 24px;
  }
  .stat span {
    font-size: 11px;
    color: var(--text-faint);
  }
  .pols img {
    width: 18px;
    height: 18px;
  }
  .abilities {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ability {
    width: 104px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid transparent;
    font-size: 12px;
    text-align: center;
  }
  .ability.on {
    border-color: var(--accent);
  }
  .ability img {
    width: 44px;
    height: 44px;
  }
  .desc {
    margin: 10px 0 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface);
    color: var(--text-dim);
    line-height: 1.5;
    white-space: pre-line;
  }
  .passive b {
    color: var(--text);
    font-weight: 600;
  }
  .build small .tag {
    margin-left: 6px;
  }
  .votes {
    width: 70px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
