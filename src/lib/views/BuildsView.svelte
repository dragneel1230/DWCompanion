<script lang="ts">
  // «Билды» (app page and hub tab): your warframes on the left (the equipped one first), the picked warframe's builds
  // on the right — configs A/B/C from the game (inventory: mods, Archon shards, Helminth), your saved builds, popular
  // ones — and the picked build's board read-only, with what you lack. Editing is the builder (/frame, the app).
  import { num, t } from "$lib/i18n/index.svelte";
  import { buildsFor, formaInfo, equipped, loadFrames, searchFrames, type Build, type FramesDb } from "$lib/frames";
  import { iconUrl } from "$lib/db";
  import { profile } from "$lib/profile.svelte";
  import { rankOf } from "$lib/mastery";
  import { bestXp, inventory } from "$lib/inventory.svelte";
  import { owned } from "$lib/owned.svelte";
  import { userBuilds } from "$lib/userBuilds.svelte";
  import BuildBoard from "$lib/components/BuildBoard.svelte";
  import ShardRow from "$lib/components/ShardRow.svelte";
  import { buildsSel, pickBuild, pickGear, setBuildsTab, type BuildsTab } from "./buildsSel.svelte";
  import GearView from "./GearView.svelte";
  import { loadGear, type Gear, type GearTab } from "$lib/gear";
  import type { Key } from "$lib/i18n/index.svelte";

  // Tabs: warframes, then gear by group; a group with several kinds shows them as a second row.
  const GROUPS: { key: string; label: Key; kinds: BuildsTab[] }[] = [
    { key: "frame", label: "gb.g.frames", kinds: ["frame"] },
    { key: "weapons", label: "gb.g.weapons", kinds: ["primary", "secondary", "melee", "exalted"] },
    { key: "companions", label: "gb.g.companions", kinds: ["companion", "cweapon"] },
    { key: "archwing", label: "gb.g.archwing", kinds: ["archwing", "archgun", "archmelee"] },
    { key: "mech", label: "gb.g.mech", kinds: ["mech"] },
  ];
  const group = $derived(GROUPS.find((g) => g.kinds.includes(buildsSel.tab)) ?? GROUPS[0]);

  let { compact = false }: { compact?: boolean } = $props();

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));
  let gearItems = $state<Record<string, Gear>>({});
  loadGear().then((c) => (gearItems = c.items)).catch(() => {});
  profile.start();

  let query = $state("");
  let all = $state(false);

  const rank = (id: string): number | null => {
    const xp = bestXp(profile.data?.xp[id], id);
    return xp == null ? null : rankOf(xp, true, 30);
  };
  const inv = $derived(!!inventory.data);
  const known = $derived(inv || !!profile.data);
  const has = (id: string) => (inv ? inventory.inArsenal(id) : rank(id) != null);
  const current = $derived(inventory.data?.current ?? null);
  const loadouts = $derived(inventory.data?.loadouts ?? null);
  // A snapshot from before shards and gear configs were read: suggest a refresh.
  const oldSnapshot = $derived(!!inventory.data && !inventory.data.equipped);

  // Owned only (all while searching or when "Все" is on); the equipped one first, then owned, by name.
  const list = $derived.by(() => {
    if (!db) return [];
    const hits = searchFrames(db, query);
    const shown = known && !all && !query ? hits.filter(([id]) => has(id)) : hits;
    const score = (id: string) => (id === current?.frame ? 2 : known && has(id) ? 1 : 0);
    return [...shown].sort(([a], [b]) => score(b) - score(a));
  });

  const frameId = $derived(db ? (db.frames[buildsSel.frame] ? buildsSel.frame : (current?.frame ?? list[0]?.[0] ?? "")) : "");
  const frame = $derived(db && frameId ? db.frames[frameId] : null);
  const builds = $derived(db && frameId ? buildsFor(db, frameId) : []);
  const buildId = $derived.by(() => {
    if (builds.some(([id]) => id === buildsSel.build)) return buildsSel.build;
    const equippedCfg = current?.frame === frameId ? `game:${frameId}:${current.cfg}` : "";
    return builds.find(([id]) => id === equippedCfg)?.[0] ?? builds[0]?.[0] ?? "";
  });
  const build = $derived(builds.find(([id]) => id === buildId)?.[1] ?? null);

  const groups = $derived([
    { key: "game", label: t("builds.inGame"), items: builds.filter(([, b]) => b.source === "game") },
    { key: "mine", label: t("builds.mine"), items: builds.filter(([id, b]) => b.source !== "game" && !!userBuilds.all[id]) },
    { key: "popular", label: t("builds.popular"), items: builds.filter(([id, b]) => b.source !== "game" && !userBuilds.all[id]) },
  ].filter((g) => g.items.length));

  // The board takes a bindable build: a plain copy.
  let view = $state<Build | null>(null);
  $effect(() => {
    view = build ? $state.snapshot(build) : null;
  });

  // Mods and arcanes of the build you don't have (a config from the game is on the frame already).
  const need = $derived.by(() => {
    if (!db || !build || build.source === "game") return null;
    const ids = [...equipped(db, build).map((e) => ({ id: e.id, name: e.mod.name, arc: false })), ...build.arcanes.filter((a) => db!.arcanes[a]).map((a) => ({ id: a, name: db!.arcanes[a].name, arc: true }))];
    return { total: ids.length, missing: ids.filter((x) => !owned.has(x.id)) };
  });

  const gear = $derived(frameId && inv ? inventory.gearOf(frameId) : null);
  // The warframe's own gear (exalted weapons, Venari): links to their builds.
  const ownGear = $derived(Object.entries(gearItems).filter(([, g]) => g.of?.includes(frameId)));
  const frameShards = (id: string) => loadouts?.[id]?.shards;
  const isMine = $derived(!!userBuilds.all[buildId]);
  const enc = encodeURIComponent;
</script>

<div class="builds" class:compact>
  {#if !compact}
    <div class="head">
      <h1>{t("nav.builds")}</h1>
      <p class="intro">{t("builds.intro")}</p>
    </div>
  {/if}

  {#if !inv}
    <p class="hint">{t("builds.noInv")} <a href="/settings">{t("builds.toSettings")}</a></p>
  {:else if oldSnapshot}
    <p class="hint">{t("builds.oldSnapshot")}</p>
  {/if}

  <div class="tabs">
    <div class="seg main">
      {#each GROUPS as g (g.key)}
        <button class:on={g === group} onclick={() => setBuildsTab(g === group ? buildsSel.tab : g.kinds[0])}>{t(g.label)}</button>
      {/each}
    </div>
    {#if group.kinds.length > 1}
      <div class="seg sub">
        {#each group.kinds as k (k)}
          <button class:on={buildsSel.tab === k} onclick={() => setBuildsTab(k)}>{t(`gb.k.${k}` as Key)}</button>
        {/each}
      </div>
    {/if}
  </div>

  {#if buildsSel.tab !== "frame"}
    {#key buildsSel.tab}<GearView kind={buildsSel.tab as GearTab} />{/key}
  {:else}
  <div class="cols">
    <aside class="frames">
      <input class="find" bind:value={query} placeholder={t("frames.find")} spellcheck="false" />
      {#if known && !query}
        <div class="seg small">
          <button class:on={!all} onclick={() => (all = false)}>{t("builds.myFrames")}</button>
          <button class:on={all} onclick={() => (all = true)}>{t("mp.all")}</button>
        </div>
      {/if}
      <div class="flist">
        {#each list as [id, f] (id)}
          {@const r = known && has(id) ? rank(id) : null}
          {@const sh = frameShards(id)}
          <button class="frow" class:on={id === frameId} class:dim={known && !has(id)} onclick={() => pickBuild(id)}>
            <img src={iconUrl(f.icon)} alt="" loading="lazy" />
            <span class="fname">
              {f.name}
              <small>
                {#if id === current?.frame}<b class="now">{t("builds.equipped")}</b>{/if}
                {#if r != null}{t("builds.rank", { r })}{/if}
                {#if inv && inventory.gearOf(id)?.forma}· {t("fact.forma", { n: inventory.gearOf(id)!.forma })}{/if}
              </small>
              {#if db && sh?.some(Boolean)}<span class="fshards"><ShardRow {db} shards={sh} compact /></span>{/if}
            </span>
          </button>
        {:else}
          <p class="muted">{t("search.none")}</p>
        {/each}
      </div>
    </aside>

    <section class="pane">
      {#if db && frame}
        <header class="fhead">
          <img src={iconUrl(frame.icon)} alt="" />
          <div class="ftitle">
            <h2>{frame.name}</h2>
            <div class="facts">
              {#if frameId === current?.frame}<span class="now">{t("builds.equippedNow")}</span>{/if}
              {#if known && has(frameId) && rank(frameId) != null}<span>{t("builds.rank", { r: rank(frameId)! })}</span>{/if}
              {#if gear?.forma}<span><img src="/icons/forma.png" alt="" /> {gear.forma}</span>{/if}
              {#if gear?.potato}<span>{t("fact.reactor")}</span>{/if}
              {#if known && !has(frameId)}<span class="miss">{t("builds.notOwned")}</span>{/if}
            </div>
          </div>
          <div class="actions">
            <a class="act" href="/frame?id={enc(frameId)}">{t("builds.frameCard")}</a>
            <a class="act" href="/frame?id={enc(frameId)}&new=1">+ {t("builds.new")}</a>
          </div>
        </header>

        {#if ownGear.length}
          <div class="group">
            <span class="glabel">{t("gb.own")}</span>
            <div class="chips">
              {#each ownGear as [gid, g] (gid)}
                <button class="chip own" onclick={() => pickGear(g.kind === "companion" ? "companion" : "exalted", gid)}>
                  <img src={iconUrl(g.icon)} alt="" />
                  <span>{g.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if groups.length}
          {#each groups as g (g.key)}
            <div class="group">
              <span class="glabel">{g.label}</span>
              <div class="chips">
                {#each g.items as [bid, b] (bid)}
                  <button class="chip" class:on={bid === buildId} onclick={() => pickBuild(frameId, bid)}>
                    <span>{b.title}</span>
                    {#if b.source === "game" && current?.frame === frameId && bid === `game:${frameId}:${current.cfg}`}<i class="dot" title={t("builds.equippedCfg")}></i>{/if}
                    {#if b.shards?.some(Boolean) && b.source !== "game"}<small>◆</small>{/if}
                    <small><img src="/icons/forma.png" alt="" />{formaInfo(frame, b.pols).count}</small>
                    {#if g.key === "popular" && b.votes}<small>▲ {b.votes}</small>{/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {:else}
          <p class="muted">{t("builds.none")}</p>
        {/if}

        {#if build && view}
          <div class="bar">
            <div class="btitle">
              <b>{build.title}</b>
              <small>{build.author}{#if build.note} · {build.note}{/if}</small>
            </div>
            {#if build.url}<a class="act" href={build.url} target="_blank" rel="noreferrer">Overframe ↗</a>{/if}
            <a class="act primary" href="/frame?id={enc(frameId)}&build={enc(buildId)}">{isMine ? t("build.edit") : t("build.copyEdit")}</a>
          </div>

          {#if need}
            <div class="need" class:ok={!need.missing.length}>
              {#if need.missing.length}
                <span>{t("builds.lack", { n: need.missing.length, total: need.total })}</span>
                {#each need.missing as m (m.id)}
                  <a href="/market?id={enc(m.id)}{m.arc ? '&k=arcane' : ''}">{m.name}</a>
                {/each}
              {:else}
                <span>{t("builds.haveAll", { n: num(need.total) })}</span>
              {/if}
            </div>
          {/if}

          {#key buildId}
            <BuildBoard {db} {frame} bind:build={view} />
          {/key}
        {/if}
      {:else if db}
        <p class="muted">{t("builds.pick")}</p>
      {/if}
    </section>
  </div>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin-bottom: 14px;
  }
  .tabs .seg {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface);
  }
  .tabs .seg button {
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .tabs .seg.sub button {
    font-size: 12.5px;
    padding: 5px 10px;
  }
  .tabs .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .head {
    margin-bottom: 14px;
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0;
  }
  .intro {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .hint {
    margin: 0 0 12px;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12.5px;
    color: var(--text-dim);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .hint a {
    color: var(--accent);
  }
  .cols {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  .frames {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 140px);
  }
  .compact .frames {
    max-height: calc(100vh - 260px);
  }
  .find {
    width: 100%;
    padding: 9px 12px;
    font-size: 13.5px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
    outline: none;
  }
  .find:focus {
    border-color: var(--accent);
  }
  .seg.small {
    display: flex;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    background: var(--surface);
  }
  .seg.small button {
    flex: 1;
    padding: 5px 8px;
    border-radius: 8px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .seg.small button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .flist {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 2px;
  }
  .frow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 9px;
    border: 1px solid transparent;
    text-align: left;
  }
  .frow:hover {
    background: var(--surface);
  }
  .frow.on {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .frow.dim {
    opacity: 0.55;
  }
  .frow > img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .fname {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    display: flex;
    flex-direction: column;
  }
  .fname small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .fshards {
    margin-top: 2px;
  }
  .fshards :global(.gem) {
    width: 15px;
    height: 15px;
  }
  .now {
    color: var(--good);
    font-weight: 600;
  }
  .pane {
    min-width: 0;
  }
  .fhead {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }
  .fhead > img {
    width: 64px;
    height: 64px;
    object-fit: contain;
  }
  .ftitle {
    flex: 1;
    min-width: 0;
  }
  .ftitle h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .facts img {
    width: 14px;
    height: 14px;
    vertical-align: -2px;
  }
  .facts .miss {
    color: var(--text-faint);
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .act {
    padding: 6px 12px;
    border-radius: 9px;
    border: 1px solid var(--line);
    font-size: 12.5px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .act:hover {
    color: var(--text);
    border-color: var(--text-faint);
  }
  .act.primary {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .group {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
  }
  .glabel {
    flex: none;
    width: 92px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .chip:hover {
    color: var(--text);
  }
  .chip.on {
    color: var(--text);
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .chip small {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .chip.own {
    padding-left: 5px;
  }
  .chip.own img {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }
  .chip small img {
    width: 12px;
    height: 12px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--good);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 14px 0 10px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .btitle {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .btitle b {
    font-size: 15px;
    font-weight: 600;
  }
  .btitle small {
    font-size: 12px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .need {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin-bottom: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12.5px;
    background: rgba(255, 123, 107, 0.08);
    border: 1px solid rgba(255, 123, 107, 0.25);
  }
  .need.ok {
    background: rgba(111, 207, 151, 0.08);
    border-color: rgba(111, 207, 151, 0.3);
    color: var(--good);
  }
  .need a {
    color: var(--text);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  .need a:hover {
    color: var(--accent);
  }
  .muted {
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
