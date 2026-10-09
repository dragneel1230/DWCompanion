<script lang="ts">
  // «Добыча» (app page and hub tab). Left: "Поиск" — one search over resources, warframes, weapons,
  // companions, components and prime parts with a one-line "how"; or "Здесь" — what drops on the current
  // mission / lobby (EE.log) or a planet picked by hand. Right: the short answer ("Как получить") and every
  // source with its origin labelled; nothing chosen — how to use it and the most needed resources.
  // The opened entry comes from outside: the app keeps it in the URL, the hub in a stack (farmState).
  import { labels, locale, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName } from "$lib/db";
  import { loadDrops, type DropsDb } from "$lib/drops";
  import { loadCraft, type CraftDb } from "$lib/craft";
  import { buildIndex, findFarm, hintOf, parentsOf, popular, FARM_KIND, FARM_KINDS, FARM_KINDS_PL, type FarmEntry, type FarmKind } from "$lib/farm";
  import type { Mission } from "$lib/hub/hub";
  import FarmResource from "$lib/components/farm/FarmResource.svelte";
  import FarmCraft from "$lib/components/farm/FarmCraft.svelte";
  import FarmPrime from "$lib/components/farm/FarmPrime.svelte";
  import FarmHere from "$lib/components/farm/FarmHere.svelte";
  import GoalButton from "$lib/goals/GoalButton.svelte";
  import UpLink from "$lib/components/UpLink.svelte";
  import OwnBadges from "$lib/components/OwnBadges.svelte";
  import { heldCount } from "$lib/ownership.svelte";
  import { farmState, setFarmMode, type FarmMode, type FarmSel } from "./farmState.svelte";

  let {
    mission,
    sel,
    onselect,
    onback,
    compact = false,
  }: { mission: Mission | null; sel: FarmSel | null; onselect: (s: FarmSel) => void; onback?: () => void; compact?: boolean } = $props();

  let db = $state<DropsDb | null>(null);
  let craft = $state<CraftDb | null>(null);
  Promise.all([loadDrops(), loadCraft()]).then(([d, c]) => ((db = d), (craft = c)));

  const MODES: { id: FarmMode; label: Key }[] = [
    { id: "find", label: "farm.find" },
    { id: "here", label: "res.here" },
  ];
  // On a mission or in a lobby "Здесь" is what the player most likely wants: say so on the button.
  const live = $derived(!!mission?.active || !!mission?.lobby?.node || !!mission?.lobby?.name);

  const index = $derived(db && craft ? buildIndex(db, craft) : []);
  const counts = $derived(Object.fromEntries(FARM_KINDS.map((k) => [k, index.filter((e) => e.kind === k).length])) as Record<FarmKind, number>);
  let shown = $state(80);

  const planets = $derived(
    db ? [...new Set(Object.values(db.resources).flatMap((r) => (r.planets ?? []).map((p) => p[0])))].sort((a, b) => a.localeCompare(b, locale())) : [],
  );
  const list = $derived.by(() => {
    if (!db) return [];
    const { query, kind, planet } = farmState;
    let l: FarmEntry[] = query.trim() ? findFarm(index, query, kind) : index.filter((e) => !kind || e.kind === kind).sort((a, b) => a.name.localeCompare(b.name, locale()));
    if (kind === "resource" && planet) l = l.filter((e) => db!.resources[e.id].planets?.some((p) => p[0] === planet));
    return l;
  });
  $effect(() => {
    void farmState.query, farmState.kind, farmState.planet;
    shown = 80;
  });

  const open = (kind: FarmSel["kind"], id: string) => {
    onselect({ kind, id });
    document.querySelector(".farm .view .body")?.scrollTo({ top: 0 });
  };
  const openEntry = (e: FarmEntry) => open(e.kind === "resource" ? "resource" : e.kind === "prime" ? "prime" : "craft", e.id);
  const isSel = (e: FarmEntry) =>
    !!sel && sel.id === e.id && (sel.kind === "resource") === (e.kind === "resource") && (sel.kind === "prime") === (e.kind === "prime");

  // Hero of the chosen entry.
  const hero = $derived.by(() => {
    if (!sel || !db || !craft) return null;
    if (sel.kind === "resource") {
      const r = db.resources[sel.id];
      // A farmable resource that also has a blueprint: "can also be built", not "built".
      const farmed = !!(r && (r.planets || r.drops || r.endless || r.src));
      return r ? { name: r.name, en: r.en, icon: r.icon, tag: FARM_KIND.resource, craft: !!r.craft, craftAlso: farmed, rarity: r.rarity } : null;
    }
    if (sel.kind === "prime") {
      const it = getDb().items[sel.id];
      return it ? { name: itemName(it), en: it.en, icon: it.icon, tag: FARM_KIND.prime, craft: false, craftAlso: false, rarity: undefined } : null;
    }
    const c = craft.items[sel.id];
    const e = index.find((x) => x.id === sel.id && x.kind !== "resource");
    return c ? { name: c.name, en: c.en, icon: c.icon, tag: e ? FARM_KIND[e.kind] : FARM_KIND.part, craft: true, craftAlso: false, rarity: undefined } : null;
  });
  // What the opened part goes into (a prime part blueprint: through the component it builds): a way back up.
  const up = $derived.by(() => {
    if (!sel || !craft || sel.kind === "resource") return [];
    let id = sel.id;
    if (sel.kind === "prime") {
      const comp = id.replace(/Blueprint$/, "Component");
      if (craft.items[comp]) id = comp;
    } else if (craft.items[id]?.kind !== "part") return [];
    return parentsOf(craft, id).map((pid) => ({ id: pid, name: craft!.items[pid].name, icon: craft!.items[pid].icon }));
  });
  // Mine: things that level get the arsenal / mastered marks, the rest how many are held (with the blueprint).
  const LEVELS = new Set<FarmKind>(["frame", "weapon", "companion"]);
  const levels = (kind: FarmKind | FarmSel["kind"]) => LEVELS.has(kind as FarmKind);
  const held = (id: string) => {
    const c = craft?.items[id];
    return heldCount(id, c ? (c.r ?? c.bp) : null);
  };
  const selKind = $derived(sel?.kind === "craft" ? (index.find((x) => x.id === sel.id && x.kind !== "resource")?.kind ?? "part") : (sel?.kind ?? "part"));
  const RARITY = labels({ common: "res.rar.common", uncommon: "res.rar.uncommon", rare: "res.rar.rare", legendary: "res.rar.legendary" }) as Record<string, string>;
  const picks = $derived(db && craft ? popular(craft, db) : []);

  let input = $state<HTMLInputElement | null>(null);
  $effect(() => {
    if (farmState.mode === "find" && !compact) input?.focus();
  });
  const onkey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && list[0]) openEntry(list[0]);
  };

  // Esc in the hub: back in the opened entries, then clear the search.
  export function dismiss(): boolean {
    if (onback && sel) {
      onback();
      return true;
    }
    if (farmState.query) {
      farmState.query = "";
      return true;
    }
    return false;
  }
</script>

<div class="farm" class:compact>
  <section class="panel side">
    <header>
      <div class="seg">
        {#each MODES as m (m.id)}
          <button class:on={farmState.mode === m.id} onclick={() => setFarmMode(m.id)}>
            {t(m.label)}{#if m.id === "here" && live}<i class="dot"></i>{/if}
          </button>
        {/each}
      </div>
    </header>

    {#if farmState.mode === "find"}
      <div class="find">
        <input bind:this={input} bind:value={farmState.query} onkeydown={onkey} placeholder={t("farm.search")} spellcheck="false" />
        <div class="kinds">
          <button class:on={!farmState.kind} onclick={() => (farmState.kind = null)}>{t("mp.all")}</button>
          {#each FARM_KINDS as k (k)}
            {#if counts[k]}<button class:on={farmState.kind === k} onclick={() => (farmState.kind = farmState.kind === k ? null : k)}>{FARM_KINDS_PL[k]} <i>{counts[k]}</i></button>{/if}
          {/each}
        </div>
        {#if farmState.kind === "resource"}
          <select bind:value={farmState.planet}>
            <option value="">{t("farm.anyPlanet")}</option>
            {#each planets as p (p)}<option value={p}>{p}</option>{/each}
          </select>
        {/if}
      </div>
    {/if}

    <div class="body">
      {#if !db || !craft}
        <div class="empty"><span>{t("common.loading")}</span></div>
      {:else if farmState.mode === "here"}
        <FarmHere {mission} drops={db} {sel} onpick={(s) => open(s.kind, s.id)} />
      {:else}
        {#each list.slice(0, shown) as e (e.kind + e.id)}
          <button class="item" class:on={isSel(e)} onclick={() => openEntry(e)}>
            {#if e.icon}<img src={iconUrl(e.icon)} alt="" loading="lazy" />{:else}<span class="noimg"></span>{/if}
            <span class="txt">
              <span class="nm">{e.name}</span>
              <small>
                <em class="k-{e.kind}">{FARM_KIND[e.kind]}</em>{#if e.craft}<em class="craft">{t("farm.craftBadge")}</em>{/if}
                <span class="hint">{hintOf(e, db, craft)}</span>
              </small>
            </span>
            {#if levels(e.kind)}
              <OwnBadges id={e.id} size={18} />
            {:else if held(e.id)}
              <span class="held" title={t("own.held", { n: held(e.id)! })}>×{held(e.id)}</span>
            {/if}
          </button>
        {:else}
          <p class="muted">{t("search.none")}</p>
        {/each}
        {#if list.length > shown}
          <button class="more" onclick={() => (shown += 120)}>{t("drops.more", { v: list.length - shown })}</button>
        {/if}
      {/if}
    </div>
  </section>

  <section class="panel view">
    <div class="body">
      {#if sel && hero && db && craft}
        {#if onback || up.length}
          <div class="nav">
            {#if onback}
              <button class="back" onclick={onback}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>{t("common.back")}</button>
            {/if}
            {#each up as p (p.id)}
              <UpLink name={p.name} icon={p.icon} onclick={() => open("craft", p.id)} />
            {/each}
          </div>
        {/if}
        {#key sel.kind + sel.id}
          <div class="swap">
            <header class="hero">
              {#if hero.icon}<img src={iconUrl(hero.icon)} alt="" />{/if}
              <div>
                <h1>{hero.name}</h1>
                <div class="sub">
                  {#if hero.en !== hero.name}<span>{hero.en}</span>{/if}
                  <span class="tag">{hero.tag}</span>
                  {#if hero.craft}<span class="tag craft">{hero.craftAlso ? t("farm.craftAlsoTag") : t("farm.craftTag")}</span>{/if}
                  {#if hero.rarity && RARITY[hero.rarity]}<span class="tag">{RARITY[hero.rarity]}</span>{/if}
                  {#if levels(selKind)}
                    <OwnBadges id={sel.id} />
                  {:else if held(sel.id)}
                    <span class="tag have">{t("own.held", { n: held(sel.id)! })}</span>
                  {/if}
                </div>
              </div>
              {#if sel.kind === "craft" && craft.items[sel.id] && craft.items[sel.id].kind !== "part" && craft.items[sel.id].kind !== "resource"}
                <div class="goal"><GoalButton id={sel.id} /></div>
              {/if}
            </header>
            {#if sel.kind === "resource"}
              <FarmResource {db} {craft} id={sel.id} onopen={open} />
            {:else if sel.kind === "prime"}
              <FarmPrime {craft} id={sel.id} onopen={open} />
            {:else}
              <FarmCraft {db} {craft} id={sel.id} onopen={open} />
            {/if}
            <p class="note">{t("res.chancesNote", { d: new Date(db.builtAt).toLocaleDateString(locale()) })}</p>
          </div>
        {/key}
      {:else if sel && db && craft}
        <p class="muted">{t("res.notFound")}</p>
      {:else if db && craft}
        <div class="welcome">
          <h2>{t("farm.welcome")}</h2>
          <p>{t("farm.welcomeText")}</p>
          <div class="legend">
            <div><span class="g">∞</span>{t("farm.legend.endless")}</div>
            <div><span class="g">◎</span>{t("farm.legend.mission")}</div>
            <div><span class="g">★</span>{t("farm.legend.wiki")}</div>
            <div><span class="g">⇄</span>{t("farm.legend.buy")}</div>
            <div><span class="g">⚒</span>{t("farm.legend.foundry")}</div>
            <div><span class="g">◈</span>{t("farm.legend.relics")}</div>
          </div>
          <div class="section-title">{t("farm.popular")}</div>
          <div class="picks">
            {#each picks as rid (rid)}
              {@const r = db.resources[rid]}
              <button onclick={() => open("resource", rid)}><img src={iconUrl(r.icon)} alt="" />{r.name}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .farm {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(300px, 0.7fr) minmax(0, 1.6fr);
    gap: 16px;
    min-height: 0;
  }
  .side,
  .view {
    min-height: 0;
  }
  .seg .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--good);
    box-shadow: 0 0 8px var(--good);
    vertical-align: middle;
  }
  .find {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 14px 10px;
  }
  input,
  select {
    width: 100%;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--glass-line);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  select {
    padding: 7px 10px;
    font-size: 13px;
  }
  input:focus {
    border-color: rgba(201, 166, 107, 0.45);
  }
  .kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .kinds button {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .kinds i {
    font-style: normal;
    color: var(--text-faint);
  }
  .kinds button.on {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .side .body {
    padding-top: 4px;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
    text-align: left;
  }
  .item:hover {
    background: var(--surface);
  }
  .item.on {
    background: var(--accent-soft);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .item img,
  .noimg {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex: none;
  }
  .txt {
    min-width: 0;
    flex: 1;
  }
  .nm {
    display: block;
    font-size: 13.5px;
  }
  .item small {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
  }
  .item em {
    flex: none;
    font-style: normal;
    color: var(--text-dim);
  }
  .item em.craft {
    color: var(--accent);
  }
  .item em.k-prime {
    color: var(--rare);
  }
  .hint {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    width: 100%;
    padding: 8px;
    font-size: 12.5px;
    color: var(--accent);
  }
  .view .body {
    padding: 22px 26px 30px;
  }
  .compact .view .body {
    padding: 16px 22px 22px;
  }
  .nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: -6px 0 12px -6px;
  }
  .back {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px 4px 6px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .back:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .back svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
  }
  .swap {
    animation: in 0.18s ease-out both;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .hero .goal {
    margin-left: auto;
    align-self: flex-start;
  }
  .held {
    flex: none;
    padding: 1px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent);
    font-size: 11.5px;
    font-weight: 600;
  }
  .tag.have {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .tag.craft {
    color: var(--accent);
    border-color: var(--accent);
  }
  .note {
    margin-top: 24px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .welcome h2 {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
  }
  .welcome > p {
    max-width: 640px;
    color: var(--text-dim);
    line-height: 1.55;
  }
  .legend {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px 18px;
    margin: 18px 0 6px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .legend div {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .g {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent);
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .picks button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 6px;
    border-radius: 9px;
    background: var(--surface);
    font-size: 13px;
  }
  .picks button:hover {
    background: var(--surface-2);
  }
  .picks img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
</style>
