<script lang="ts">
  // "Где добыть": one search over resources, warframes, weapons, companions, components and prime parts.
  // Left: search, type filter, results with a one-line "how". Right: the short answer ("Как получить")
  // and every source with its origin labelled. Nothing chosen: how to use it and the most needed resources.
  // URLs: ?id=<resource>, ?craft=<item or component>, ?prime=<prime part> (links from search, hub, relics).
  import { labels, locale, t } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { getDb, iconUrl, itemName } from "$lib/db";
  import { loadDrops, type DropsDb } from "$lib/drops";
  import { loadCraft, type CraftDb } from "$lib/craft";
  import { buildIndex, findFarm, hintOf, popular, FARM_KIND, FARM_KINDS, FARM_KINDS_PL, type FarmEntry, type FarmKind } from "$lib/farm";
  import FarmResource from "$lib/components/farm/FarmResource.svelte";
  import FarmCraft from "$lib/components/farm/FarmCraft.svelte";
  import FarmPrime from "$lib/components/farm/FarmPrime.svelte";

  let db = $state<DropsDb | null>(null);
  let craft = $state<CraftDb | null>(null);
  Promise.all([loadDrops(), loadCraft()]).then(([d, c]) => ((db = d), (craft = c)));

  const index = $derived(db && craft ? buildIndex(db, craft) : []);
  const counts = $derived(Object.fromEntries(FARM_KINDS.map((k) => [k, index.filter((e) => e.kind === k).length])) as Record<FarmKind, number>);

  let query = $state("");
  let kind = $state<FarmKind | null>(null);
  let planet = $state("");
  let shown = $state(80);

  const planets = $derived(
    db ? [...new Set(Object.values(db.resources).flatMap((r) => (r.planets ?? []).map((p) => p[0])))].sort((a, b) => a.localeCompare(b, locale())) : [],
  );
  const list = $derived.by(() => {
    if (!db) return [];
    let l: FarmEntry[] = query.trim() ? findFarm(index, query, kind) : index.filter((e) => !kind || e.kind === kind).sort((a, b) => a.name.localeCompare(b.name, locale()));
    if (kind === "resource" && planet) l = l.filter((e) => db!.resources[e.id].planets?.some((p) => p[0] === planet));
    return l;
  });
  $effect(() => {
    void query, kind, planet;
    shown = 80;
  });

  // The chosen entry, from the URL.
  const sel = $derived.by((): { kind: "resource" | "craft" | "prime"; id: string } | null => {
    const p = page.url.searchParams;
    if (p.get("id")) return { kind: "resource", id: p.get("id")! };
    if (p.get("craft")) return { kind: "craft", id: p.get("craft")! };
    if (p.get("prime")) return { kind: "prime", id: p.get("prime")! };
    return null;
  });
  const PARAM = { resource: "id", craft: "craft", prime: "prime" } as const;
  function open(k: "resource" | "craft" | "prime", id: string) {
    goto(`/resources?${PARAM[k]}=${encodeURIComponent(id)}`, { keepFocus: true, noScroll: false });
    document.querySelector(".detail")?.scrollTo({ top: 0 });
  }
  const openEntry = (e: FarmEntry) => open(e.kind === "resource" ? "resource" : e.kind === "prime" ? "prime" : "craft", e.id);
  const isSel = (e: FarmEntry) =>
    !!sel && sel.id === e.id && (sel.kind === "resource") === (e.kind === "resource") && (sel.kind === "prime") === (e.kind === "prime");

  // Hero of the chosen entry.
  const hero = $derived.by(() => {
    if (!sel || !db || !craft) return null;
    if (sel.kind === "resource") {
      const r = db.resources[sel.id];
      // A farmable resource that also has a blueprint: "can also be built", not "built".
      const farmed = !!(r.planets || r.drops || r.endless || r.src);
      return r ? { name: r.name, en: r.en, icon: r.icon, tag: FARM_KIND.resource, craft: !!r.craft, craftAlso: farmed, rarity: r.rarity } : null;
    }
    if (sel.kind === "prime") {
      const it = getDb().items[sel.id];
      return it ? { name: itemName(it), en: it.en, icon: it.icon, tag: FARM_KIND.prime, craft: false } : null;
    }
    const c = craft.items[sel.id];
    const e = index.find((x) => x.id === sel.id && x.kind !== "resource");
    return c ? { name: c.name, en: c.en, icon: c.icon, tag: e ? FARM_KIND[e.kind] : FARM_KIND.part, craft: true } : null;
  });
  const RARITY = labels({ common: "res.rar.common", uncommon: "res.rar.uncommon", rare: "res.rar.rare", legendary: "res.rar.legendary" }) as Record<string, string>;
  const picks = $derived(db && craft ? popular(craft, db) : []);

  let input = $state<HTMLInputElement | null>(null);
  $effect(() => input?.focus());
</script>

<div class="wrap">
  <aside>
    <div class="head">
      <h1>{t("farm.title")}</h1>
      <p>{t("farm.subtitle")}</p>
    </div>
    <input bind:this={input} bind:value={query} placeholder={t("farm.search")} spellcheck="false" />
    <div class="kinds">
      <button class:on={!kind} onclick={() => (kind = null)}>{t("mp.all")}</button>
      {#each FARM_KINDS as k}
        {#if counts[k]}<button class:on={kind === k} onclick={() => (kind = kind === k ? null : k)}>{FARM_KINDS_PL[k]} <i>{counts[k]}</i></button>{/if}
      {/each}
    </div>
    {#if kind === "resource"}
      <select bind:value={planet}>
        <option value="">{t("farm.anyPlanet")}</option>
        {#each planets as p}<option value={p}>{p}</option>{/each}
      </select>
    {/if}
    <div class="list">
      {#if db && craft}
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
          </button>
        {:else}
          <p class="muted">{t("search.none")}</p>
        {/each}
        {#if list.length > shown}
          <button class="more" onclick={() => (shown += 120)}>{t("drops.more", { v: list.length - shown })}</button>
        {/if}
      {/if}
    </div>
  </aside>

  <section class="detail">
    {#if sel && hero && db && craft}
      <header class="hero">
        {#if hero.icon}<img src={iconUrl(hero.icon)} alt="" />{/if}
        <div>
          <h1>{hero.name}</h1>
          <div class="sub">
            {#if hero.en !== hero.name}<span>{hero.en}</span>{/if}
            <span class="tag">{hero.tag}</span>
            {#if hero.craft}<span class="tag craft">{"craftAlso" in hero && hero.craftAlso ? t("farm.craftAlsoTag") : t("farm.craftTag")}</span>{/if}
            {#if hero.rarity && RARITY[hero.rarity]}<span class="tag">{RARITY[hero.rarity]}</span>{/if}
          </div>
        </div>
      </header>
      {#if sel.kind === "resource"}
        <FarmResource {db} {craft} id={sel.id} onopen={open} />
      {:else if sel.kind === "prime"}
        <FarmPrime {craft} id={sel.id} onopen={open} />
      {:else}
        <FarmCraft {db} {craft} id={sel.id} onopen={open} />
      {/if}
      <p class="note">{t("res.chancesNote", { d: new Date(db.builtAt).toLocaleDateString(locale()) })}</p>
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
  </section>
</div>

<style>
  .wrap {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    height: 100vh;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 24px 12px 0 20px;
    border-right: 1px solid var(--line);
  }
  .head h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }
  .head p {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  input,
  select {
    width: 100%;
    padding: 11px 13px;
    border-radius: var(--radius);
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    outline: none;
  }
  select {
    padding: 7px 10px;
    font-size: 13px;
  }
  input:focus {
    border-color: var(--accent);
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
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
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
    background: var(--surface-2);
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
  .detail {
    overflow-y: auto;
    padding: 28px 32px 60px;
    max-width: 1020px;
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
    margin: 8px 0 8px;
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
