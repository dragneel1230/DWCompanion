<script lang="ts">
  // «Билды» for one kind of gear (weapons, companions, archwings, necramechs, the warframes' own weapons): your items on the left (the equipped
  // one first), on the right its configs from the game (inventory) and your saved builds, the picked one's board
  // read-only with what you lack. Without any build the bare item shows its base stats. Editing: /gear (the app).
  import { num, t } from "$lib/i18n/index.svelte";
  import { iconUrl, normalize } from "$lib/db";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { emptyGearBuild, gameGearBuilds, gearEquipped, gearForma, inTab, isWeapon, loadGear, type GearBuild, type GearCtx, type GearTab } from "$lib/gear";
  import { gearBuilds } from "$lib/gearBuilds.svelte";
  import { inventory, bestXp } from "$lib/inventory.svelte";
  import { profile } from "$lib/profile.svelte";
  import { rankOf } from "$lib/mastery";
  import { owned } from "$lib/owned.svelte";
  import GearBoard from "$lib/components/GearBoard.svelte";
  import ShareButton from "$lib/components/ShareButton.svelte";
  import { buildsSel, pickGear } from "./buildsSel.svelte";

  let { kind }: { kind: GearTab } = $props();

  let ctx = $state<GearCtx | null>(null);
  let fdb = $state<FramesDb | null>(null);
  let failed = $state(false);
  loadGear().then((c) => (ctx = c)).catch(() => (failed = true));
  loadFrames().then((d) => (fdb = d));

  let query = $state("");
  let all = $state(false);

  const inv = $derived(!!inventory.data);
  const equipped = $derived(inventory.data?.equipped ?? {});
  // Exalted weapons and Venari come with their warframe (the inventory lists them apart, not in the arsenal).
  const has = (id: string) => inventory.inArsenal(id) || !!inventory.data?.loadouts?.[id] || !!ctx?.items[id]?.of?.some((f) => inventory.inArsenal(f));
  const ownerName = (id: string) => [...new Set((ctx?.items[id]?.of ?? []).map((f) => fdb?.frames[f]?.name).filter(Boolean))].join(", ");
  const rank = (id: string): number | null => {
    const g = ctx?.items[id];
    const xp = bestXp(profile.data?.xp[id], id) ?? (inventory.data?.loadouts?.[id]?.xp || undefined);
    return g && xp != null ? rankOf(xp, !isWeapon(g.kind), g.maxRank) : null;
  };

  const list = $derived.by(() => {
    if (!ctx) return [];
    const q = normalize(query);
    const rows = Object.entries(ctx.items).filter(([, g]) => inTab(g, kind) && (!q || normalize(g.ru).includes(q) || normalize(g.en).includes(q)));
    const shown = inv && !all && !q ? rows.filter(([id]) => has(id)) : rows;
    const score = (id: string) => (equipped[id] != null ? 2 : inv && has(id) ? 1 : 0);
    return shown.sort(([a, x], [b, y]) => score(b) - score(a) || x.name.localeCompare(y.name));
  });

  const itemId = $derived.by(() => {
    if (!ctx) return "";
    const sel = buildsSel.item[kind];
    if (sel && ctx.items[sel] && inTab(ctx.items[sel], kind)) return sel;
    return list.find(([id]) => equipped[id] != null)?.[0] ?? list[0]?.[0] ?? "";
  });
  const gear = $derived(ctx && itemId ? ctx.items[itemId] : null);
  const game = $derived(ctx && itemId ? gameGearBuilds(ctx, itemId) : []);
  const mine = $derived(itemId ? gearBuilds.of(itemId) : []);
  const builds = $derived([...game, ...mine]);
  const buildId = $derived.by(() => {
    if (builds.some(([id]) => id === buildsSel.gbuild)) return buildsSel.gbuild;
    const eq = equipped[itemId];
    return builds.find(([id]) => eq != null && id === `game:${itemId}:${eq}`)?.[0] ?? builds[0]?.[0] ?? "";
  });
  const build = $derived(builds.find(([id]) => id === buildId)?.[1] ?? null);

  // The board takes a bindable build: a plain copy (or the bare item when there is no build).
  let view = $state<GearBuild | null>(null);
  $effect(() => {
    view = build ? $state.snapshot(build) : gear ? emptyGearBuild(itemId, gear) : null;
  });

  const need = $derived.by(() => {
    if (!ctx || !build || build.source === "game") return null;
    const ids = [
      ...gearEquipped(ctx, build).map((e) => ({ id: e.id, name: e.mod.name, arc: false })),
      ...build.arcanes.filter((a) => ctx!.arcanes[a]).map((a) => ({ id: a, name: ctx!.arcanes[a].name, arc: true })),
    ];
    return { total: ids.length, missing: ids.filter((x) => !owned.has(x.id)) };
  });

  const gearInfo = $derived(itemId && inv ? inventory.gearOf(itemId) : null);
  const isMine = $derived(!!gearBuilds.all[buildId]);
  const enc = encodeURIComponent;
</script>

{#if failed}
  <p class="muted">{t("gb.noData")}</p>
{:else}
  <div class="cols">
    <aside class="items">
      <input class="find" bind:value={query} placeholder={t("gb.find")} spellcheck="false" />
      {#if inv && !query}
        <div class="seg small">
          <button class:on={!all} onclick={() => (all = false)}>{t("builds.myFrames")}</button>
          <button class:on={all} onclick={() => (all = true)}>{t("mp.all")}</button>
        </div>
      {/if}
      <div class="ilist">
        {#each list as [id, g] (id)}
          {@const r = inv && has(id) ? rank(id) : null}
          <button class="irow" class:on={id === itemId} class:dim={inv && !has(id)} onclick={() => pickGear(kind, id)}>
            <img src={iconUrl(g.icon)} alt="" loading="lazy" />
            <span class="iname">
              {g.name}
              <small>
                {#if g.of && ownerName(id)}<span class="owner">{ownerName(id)}</span>{/if}
                {#if equipped[id] != null}<b class="now">{t("builds.equipped")}</b>{/if}
                {#if r != null}{t("builds.rank", { r })}{/if}
                {#if inv && inventory.gearOf(id)?.forma}· {t("fact.forma", { n: inventory.gearOf(id)!.forma })}{/if}
              </small>
            </span>
          </button>
        {:else}
          {#if ctx}<p class="muted">{inv && !all ? t("gb.noneOwned") : t("search.none")}</p>{/if}
        {/each}
      </div>
    </aside>

    <section class="pane">
      {#if ctx && fdb && gear}
        <header class="ghead">
          <img src={iconUrl(gear.icon)} alt="" />
          <div class="gtitle">
            <h2>{gear.name}</h2>
            <div class="facts">
              {#if equipped[itemId] != null}<span class="now">{t("builds.equippedNow")}</span>{/if}
              {#if inv && has(itemId) && rank(itemId) != null}<span>{t("builds.rank", { r: rank(itemId)! })}</span>{/if}
              {#if gearInfo?.forma}<span><img src="/icons/forma.png" alt="" /> {gearInfo.forma}</span>{/if}
              {#if gearInfo?.potato}<span>{isWeapon(gear.kind) ? t("gb.catalystShort") : t("fact.reactor")}</span>{/if}
              {#if inv && !has(itemId)}<span class="miss">{t("builds.notOwned")}</span>{/if}
              {#if gear.of && ownerName(itemId)}<span>{t("gb.of", { f: ownerName(itemId) })}</span>{/if}
              {#if gear.mr}<span>{t("gb.mr", { v: gear.mr })}</span>{/if}
            </div>
          </div>
          <div class="actions">
            <a class="act" href="/gear?id={enc(itemId)}&new=1">+ {t("builds.new")}</a>
          </div>
        </header>

        {#if builds.length}
          {#each [{ key: "game", label: t("builds.inGame"), items: game }, { key: "mine", label: t("builds.mine"), items: mine }].filter((x) => x.items.length) as grp (grp.key)}
            <div class="group">
              <span class="glabel">{grp.label}</span>
              <div class="chips">
                {#each grp.items as [bid, b] (bid)}
                  <button class="chip" class:on={bid === buildId} onclick={() => pickGear(kind, itemId, bid)}>
                    <span>{b.title}</span>
                    {#if b.source === "game" && equipped[itemId] != null && bid === `game:${itemId}:${equipped[itemId]}`}<i class="dot" title={t("builds.equippedCfg")}></i>{/if}
                    <small><img src="/icons/forma.png" alt="" />{gearForma(gear, b.pols).count}</small>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {:else}
          <p class="muted">{inv ? t("gb.noBuilds") : t("gb.noBuildsInv")}</p>
        {/if}

        {#if view}
          <div class="bar">
            <div class="btitle">
              <b>{build ? build.title : t("gb.bare")}</b>
              <small>{build ? build.author : t("gb.bareHint")}</small>
            </div>
            {#if build}
              <ShareButton get={() => ({ k: "g", b: $state.snapshot(build) })} />
              <a class="act primary" href="/gear?id={enc(itemId)}&build={enc(buildId)}">{isMine ? t("build.edit") : t("build.copyEdit")}</a>
            {:else}
              <a class="act primary" href="/gear?id={enc(itemId)}&new=1">{t("gb.make")}</a>
            {/if}
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

          {#key `${itemId}|${buildId}`}
            <GearBoard {ctx} {fdb} {gear} bind:build={view} />
          {/key}
        {/if}
      {:else if ctx && !list.length}
        <p class="muted">{t("builds.pick")}</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .cols {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  .items {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: calc(100vh - 200px);
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
  .ilist {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 2px;
  }
  .irow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 9px;
    border: 1px solid transparent;
    text-align: left;
  }
  .irow:hover {
    background: var(--surface);
  }
  .irow.on {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .irow.dim {
    opacity: 0.55;
  }
  .irow > img {
    width: 40px;
    height: 34px;
    object-fit: contain;
    flex: none;
  }
  .iname {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    display: flex;
    flex-direction: column;
  }
  .owner {
    color: var(--accent);
  }
  .iname small {
    font-size: 11px;
    color: var(--text-faint);
  }
  .now {
    color: var(--good);
    font-weight: 600;
  }
  .pane {
    min-width: 0;
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }
  .ghead > img {
    width: 84px;
    height: 64px;
    object-fit: contain;
  }
  .gtitle {
    flex: 1;
    min-width: 0;
  }
  .gtitle h2 {
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
