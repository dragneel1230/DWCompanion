<script lang="ts">
  // Hub tab "Ресурсы": what drops here (current mission / lobby, or a planet picked by hand), every
  // resource, and crafting (what an item takes, whole tree). Right side: the pick with its own "Назад".
  import { locale, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, nodeOfMission, normalize } from "$lib/db";
  import { loadDrops, rate, PLANET_RARITY_RU, type DropsDb } from "$lib/drops";
  import { loadCraft, CRAFT_KIND_RU, type CraftDb, type CraftKind } from "$lib/craft";
  import FarmResource from "$lib/components/farm/FarmResource.svelte";
  import FarmCraft from "$lib/components/farm/FarmCraft.svelte";
  import type { Mission, View } from "./hub";
  import { tabs, saveTabs, type ResMode, type ResPick } from "./tabState.svelte";

  let { mission, onopen }: { mission: Mission | null; onopen: (v: View) => void } = $props();

  let drops = $state<DropsDb | null>(null);
  let craft = $state<CraftDb | null>(null);
  loadDrops().then((d) => (drops = d));
  loadCraft().then((c) => (craft = c));

  const MODES: { id: ResMode; label: Key }[] = [
    { id: "here", label: "res.here" },
    { id: "all", label: "nav.resources" },
    { id: "craft", label: "kind.craft" },
  ];
  const KINDS: { id: string; label: Key; of: CraftKind[] }[] = [
    { id: "all", label: "res.kind.all", of: [] },
    { id: "frame", label: "mastery.cat.warframe", of: ["frame"] },
    { id: "weapon", label: "res.kind.weapon", of: ["weapon"] },
    { id: "other", label: "mastery.cat.other", of: ["companion", "archwing", "mech", "gear"] },
  ];

  const setMode = (m: ResMode) => ((tabs.resMode = m), (tabs.resQuery = ""), saveTabs());
  const pick = (p: ResPick) => (tabs.resStack = [p]);
  const push = (p: ResPick) => (tabs.resStack = [...tabs.resStack, p]);
  const back = () => (tabs.resStack = tabs.resStack.slice(0, -1));
  // Links inside the shared farming views: resources and craft stay in this tab, prime parts open the item.
  const go = (k: "resource" | "craft" | "prime", id: string) =>
    k === "resource" ? push({ kind: "res", id }) : k === "craft" ? push({ kind: "craft", id }) : onopen({ kind: "item", id });
  const cur = $derived(tabs.resStack.at(-1));

  // ---------- where the player is: mission in progress, else the lobby
  const place = $derived.by(() => {
    const w = getDb().world;
    // The client writes the place in its own language: through the node it is named from the data.
    const fromName = (name: string | null) => {
      const node = nodeOfMission(name);
      if (node) return fromNode(node);
      const ru = name?.split(" - ")[0]?.trim();
      return ru ? { ru, planet: ru.match(/\(([^)]+)\)$/)?.[1] ?? null } : null;
    };
    const fromNode = (node: string | null) => {
      const ru = node ? w.regions[node.replace(/_.*$/, "")]?.n : undefined;
      return ru ? { ru, planet: ru.match(/\(([^)]+)\)$/)?.[1] ?? null } : null;
    };
    const m = mission;
    if (m?.active) {
      const p = fromName(m.name) ?? fromNode(m.node);
      if (p) return { ...p, node: m.node?.replace(/_.*$/, "") ?? null, how: "mission" };
    }
    if (m?.lobby) {
      const p = fromName(m.lobby.name) ?? fromNode(m.lobby.node);
      if (p) return { ...p, node: m.lobby.node?.replace(/_.*$/, "") ?? null, how: "lobby" };
    }
    return null;
  });
  const planets = $derived(drops ? [...new Set(Object.values(drops.resources).flatMap((r) => (r.planets ?? []).map((p) => p[0])))].sort((a, b) => a.localeCompare(b, locale())) : []);
  const planet = $derived(tabs.resPlanet ?? place?.planet ?? null);

  const RAR_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2 };
  // Resources enemies and containers drop on the planet.
  const planetRes = $derived(
    drops && planet
      ? Object.entries(drops.resources)
          .map(([id, r]) => ({ id, r, rar: r.planets?.find((p) => p[0] === planet)?.[1] }))
          .filter((x) => x.rar)
          .sort((a, b) => RAR_ORDER[a.rar!] - RAR_ORDER[b.rar!] || a.r.name.localeCompare(b.r.name, locale()))
      : [],
  );
  // Mission rewards of this very node: resources and relics, best per hour first.
  const nodeDrops = $derived.by(() => {
    if (!drops || !place || tabs.resPlanet) return null;
    const here = new Set<number>();
    drops.sources.forEach((s, i) => {
      if (s.kind === "mission" && ((place.node && s.node === place.node) || s.name === place.ru)) here.add(i);
    });
    if (!here.size) return { res: [], relics: [] };
    // One row per resource / relic: the best of this node's sources (normal and Steel Path tables).
    const res = Object.entries(drops.resources)
      .map(([id, r]) => ({ id, r, score: Math.max(0, ...(r.drops ?? []).filter((d) => here.has(d[0])).map((d) => d[2])) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const db = getDb();
    const relics = Object.entries(drops.relics)
      .map(([key, list]) => ({ key, relic: db.relics[key], score: Math.max(0, ...list.filter((d) => here.has(d[0])).map((d) => d[2])) }))
      .filter((x) => x.relic && x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { res, relics };
  });

  // ---------- lists with the search
  const words = $derived(normalize(tabs.resQuery).split(" ").filter(Boolean));
  const hit = (ru: string, en: string) => {
    if (!words.length) return true;
    const keys = `${normalize(ru)} ${normalize(en)}`.split(" ");
    return words.every((w) => keys.some((k) => k.startsWith(w)));
  };
  const allRes = $derived(
    drops
      ? Object.entries(drops.resources)
          .filter(([, r]) => hit(r.ru, r.en))
          .sort((a, b) => a[1].name.localeCompare(b[1].name, locale()))
      : [],
  );
  const craftList = $derived.by(() => {
    if (!craft) return [];
    const of = KINDS.find((k) => k.id === tabs.craftKind)?.of ?? [];
    return Object.entries(craft.items)
      .filter(([, c]) => c.kind !== "part" && c.kind !== "resource" && (!of.length || of.includes(c.kind)) && hit(c.ru, c.en))
      .sort((a, b) => a[1].name.localeCompare(b[1].name, locale()))
      .slice(0, 300);
  });


  const onkey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const first = tabs.resMode === "craft" ? craftList[0] : tabs.resMode === "all" ? allRes[0] : undefined;
      if (first) pick({ kind: tabs.resMode === "craft" ? "craft" : "res", id: first[0] });
    }
  };

  // Esc in the hub: step back in this tab first.
  export function dismiss(): boolean {
    if (tabs.resStack.length) {
      back();
      return true;
    }
    if (tabs.resQuery) {
      tabs.resQuery = "";
      return true;
    }
    return false;
  }
</script>

{#snippet resRow(id: string, ru: string, icon: string | null, note: string, right?: string)}
  <button class="row item" class:on={cur?.kind === "res" && cur.id === id} onclick={() => pick({ kind: "res", id })}>
    <img src={iconUrl(icon)} alt="" loading="lazy" />
    <span class="name">{ru}{#if note}<small>{note}</small>{/if}</span>
    {#if right}<span class="right">{right}</span>{/if}
  </button>
{/snippet}

<div class="res-tab">
  <section class="panel side">
    <header>
      <div class="seg">
        {#each MODES as m}
          <button class:on={tabs.resMode === m.id} onclick={() => setMode(m.id)}>{t(m.label)}</button>
        {/each}
      </div>
    </header>
    {#if tabs.resMode !== "here"}
      <input
        class="filter"
        bind:value={tabs.resQuery}
        onkeydown={onkey}
        placeholder={tabs.resMode === "craft" ? t("res.craftFilter") : t("res.filter")}
        spellcheck="false"
      />
    {/if}
    {#if tabs.resMode === "craft"}
      <div class="chips">
        {#each KINDS as k}
          <button class:on={tabs.craftKind === k.id} onclick={() => (tabs.craftKind = k.id)}>{t(k.label)}</button>
        {/each}
      </div>
    {/if}

    <div class="body">
      {#if !drops || (tabs.resMode === "craft" && !craft)}
        <div class="empty"><span>{t("common.loading")}</span></div>
      {:else if tabs.resMode === "here"}
        {#if place && !tabs.resPlanet}
          <div class="where">
            <small>{place.how === "mission" ? t("res.onMission") : t("res.inLobby")}</small>
            <b>{place.ru}</b>
          </div>
        {/if}
        <div class="chips planets">
          {#if place?.planet}
            <button class:on={!tabs.resPlanet} onclick={() => (tabs.resPlanet = null)}>{t("res.here")}</button>
          {/if}
          {#each planets as p}
            <button class:on={planet === p && (tabs.resPlanet === p || !place)} onclick={() => (tabs.resPlanet = p)}>{p}</button>
          {/each}
        </div>
        {#if !planet}
          <div class="empty"><b>{t("res.onShip")}</b><span>{t("res.onShipHint")}</span></div>
        {/if}
        {#if nodeDrops?.res.length}
          <div class="section-title">{t("res.nodeRewards")}</div>
          <div class="rows">
            {#each nodeDrops.res as x (x.id)}
              {@render resRow(x.id, x.r.name, x.r.icon, t("res.missionReward"), rate(x.score))}
            {/each}
          </div>
        {/if}
        {#if nodeDrops?.relics.length}
          <div class="section-title">{t("res.nodeRelics")}</div>
          <div class="rows">
            {#each nodeDrops.relics as x (x.key)}
              <button class="row item" onclick={() => onopen({ kind: "relic", id: x.key })}>
                <img src={iconUrl(x.relic.icon)} alt="" loading="lazy" />
                <span class="name">{x.relic.name}</span>
                <span class="right">{rate(x.score)}</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if planetRes.length}
          <div class="section-title">{t("res.planetEnemies", { planet })}</div>
          <div class="rows">
            {#each planetRes as x (x.id)}
              {@render resRow(x.id, x.r.name, x.r.icon, "", PLANET_RARITY_RU[x.rar!] ?? x.rar)}
            {/each}
          </div>
        {/if}
      {:else if tabs.resMode === "all"}
        <div class="rows">
          {#each allRes as [id, r] (id)}
            {@render resRow(id, r.name, r.icon, r.planets?.map((p) => p[0]).join(", ") ?? "")}
          {:else}
            <div class="empty"><span>{t("search.none")}</span></div>
          {/each}
        </div>
      {:else if craft}
        <div class="rows">
          {#each craftList as [id, c] (id)}
            <button class="row item" class:on={cur?.kind === "craft" && cur.id === id} onclick={() => pick({ kind: "craft", id })}>
              <img src={iconUrl(c.icon)} alt="" loading="lazy" />
              <span class="name">{c.name}<small>{CRAFT_KIND_RU[c.kind]}</small></span>
            </button>
          {:else}
            <div class="empty"><span>{t("search.none")}</span></div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="panel view">
    {#if cur && drops}
      {@const r = cur.kind === "res" ? drops.resources[cur.id] : null}
      {@const c = cur.kind === "craft" ? craft?.items[cur.id] : null}
      <header>
        {#if tabs.resStack.length > 1}
          <button class="back" onclick={back}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>{t("common.back")}</button>
        {/if}
      </header>
      {#key cur.kind + cur.id}
        <div class="body swap">
          {#if r && craft}
            <div class="hero">
              <img src={iconUrl(r.icon)} alt="" />
              <div>
                <h1>{r.name}</h1>
                <small>{r.en}</small>
              </div>
            </div>
            <FarmResource db={drops} {craft} id={cur.id} onopen={go} />
          {:else if c && craft}
            <div class="hero">
              {#if c.icon}<img src={iconUrl(c.icon)} alt="" />{/if}
              <div>
                <h1>{c.name}</h1>
                <small>{c.en} · {CRAFT_KIND_RU[c.kind]}</small>
              </div>
            </div>
            <FarmCraft db={drops} {craft} id={cur.id} onopen={go} />
          {/if}
        </div>
      {/key}
    {:else}
      <div class="empty center">
        <b>{t("res.introTitle")}</b>
        <span>{t("res.intro")}</span>
      </div>
    {/if}
  </section>
</div>

<style>
  .res-tab {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(300px, 0.75fr) minmax(0, 1.6fr);
    gap: 16px;
  }
  .side .body {
    padding-top: 4px;
  }
  .filter {
    margin: 0 14px 10px;
    padding: 9px 12px;
    border-radius: 10px;
    border: 1px solid var(--glass-line);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .filter:focus {
    outline: none;
    border-color: rgba(201, 166, 107, 0.45);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 14px 10px;
  }
  .body .chips {
    padding: 0 0 12px;
  }
  .chips button,
  .chips button.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .where {
    display: flex;
    flex-direction: column;
    padding: 4px 4px 10px;
  }
  .where small {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .where b {
    font-size: 16px;
    font-weight: 500;
    color: var(--accent);
  }
  .section-title {
    margin: 12px 4px 6px;
  }
  .item {
    padding: 6px 10px;
  }
  .item > img {
    width: 30px;
    height: 30px;
  }
  .item .name {
    font-size: 13.5px;
  }
  .item .name small {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item.on {
    background: var(--accent-soft);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .right {
    flex: none;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .view > header {
    min-height: 20px;
  }
  .view .body {
    padding: 0 22px 22px;
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
  .hero {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 14px;
  }
  .hero img {
    width: 64px;
    height: 64px;
    object-fit: contain;
  }
  .hero h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .hero small {
    color: var(--text-faint);
    font-size: 13px;
  }
  .center {
    margin: auto;
    max-width: 420px;
    text-align: center;
  }
</style>
