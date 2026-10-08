<script lang="ts">
  // Builder for gear besides warframes (gear.ts): ?id=<item> new build, &build=<id> edit / copy one.
  // Saved builds: gearBuilds (localStorage), shown in «Билды» next to the configs from the game.
  import { num, t } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { iconUrl } from "$lib/db";
  import { loadFrames, endoCost, type FramesDb } from "$lib/frames";
  import { emptyGearBuild, gameGearBuilds, gearEquipped, gearForma, loadGear, type GearBuild, type GearCtx } from "$lib/gear";
  import { gearBuilds } from "$lib/gearBuilds.svelte";
  import GearBoard from "$lib/components/GearBoard.svelte";

  let ctx = $state<GearCtx | null>(null);
  let fdb = $state<FramesDb | null>(null);
  loadGear().then((c) => (ctx = c));
  loadFrames().then((d) => (fdb = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  const editId = $derived(page.url.searchParams.get("build"));
  const gear = $derived(ctx?.items[id]);

  let build = $state<GearBuild | null>(null);
  let title = $state("");
  let savedAt = $state(0);

  $effect(() => {
    if (!ctx || !gear) return;
    const src = editId ? (gearBuilds.all[editId] ?? gameGearBuilds(ctx, id).find(([b]) => b === editId)?.[1]) : undefined;
    const base = emptyGearBuild(id, gear);
    const snap = src ? $state.snapshot(src) : null;
    build = snap ? { ...base, ...snap, pols: snap.pols ?? base.pols, ranks: snap.ranks ?? base.ranks, source: undefined } : base;
    title = src?.title ?? "";
  });

  const own = $derived(!!editId && !!gearBuilds.all[editId]);
  const forma = $derived(gear && build ? gearForma(gear, build.pols).count : 0);
  const endo = $derived(ctx && build ? gearEquipped(ctx, build).reduce((s, e) => s + endoCost(e.mod, e.rank), 0) : 0);
  const empty = $derived(!build || (!build.exilus && !build.stance && !build.arcanes.length && build.slots.every((s) => !s)));
  const mine = $derived(id ? gearBuilds.of(id) : []);

  function save() {
    if (!build) return;
    const bid = own ? editId! : `my-${Date.now()}`;
    gearBuilds.save(bid, { ...$state.snapshot(build), item: id, title: title.trim() || t("frame.myBuild"), author: t("frame.myBuildAuthor"), source: undefined });
    savedAt = Date.now();
    if (!own) goto(`/gear?id=${encodeURIComponent(id)}&build=${encodeURIComponent(bid)}`, { replaceState: true, noScroll: true });
  }
  function remove() {
    if (!own) return;
    gearBuilds.remove(editId!);
    goto(`/gear?id=${encodeURIComponent(id)}`, { replaceState: true });
  }
  const back = $derived(gear ? `/frames?gear=${encodeURIComponent(id)}&kind=${gear.kind}${own ? `&build=${encodeURIComponent(editId!)}` : ""}` : "/frames");
</script>

{#if ctx && fdb && gear && build}
  <div class="page wide">
    <a class="back" href={back}>← {t("nav.builds")}</a>
    <header class="top">
      <img class="portrait" src={iconUrl(gear.icon)} alt="" />
      <div class="head">
        <div class="title-row">
          <div>
            <h1>{gear.name}</h1>
            <input class="title" bind:value={title} placeholder={editId ? t("frame.buildName") : t("frame.newBuildName")} spellcheck="false" />
          </div>
          <div class="actions">
            {#if own}<button class="act" onclick={remove}>{t("build.delete")}</button>{/if}
            <button class="act primary" onclick={save} disabled={empty}>{own ? t("common.save") : t("frame.saveToMine")}</button>
          </div>
        </div>
        <div class="costs">
          <span title={t("frame.formaHint")}><img src="/icons/forma.png" alt={t("frame.forma")} /> {forma}</span>
          <span title={t("frame.endoHint")}><img src="/icons/endo.png" alt={t("frame.endo")} /> {num(endo)}</span>
          {#if savedAt && own}<span class="saved">{t("frame.saved")}</span>{/if}
        </div>
      </div>
    </header>

    <GearBoard {ctx} {fdb} {gear} bind:build editable />

    {#if mine.length}
      <section class="mine">
        <div class="section-title">{t("builds.mine")}</div>
        <div class="rows">
          {#each mine as [bid, b] (bid)}
            <a class="row" class:on={bid === editId} href="/gear?id={encodeURIComponent(id)}&build={encodeURIComponent(bid)}">
              <span class="name">{b.title}</span>
              <span class="bf"><img src="/icons/forma.png" alt="" /> {gearForma(gear, b.pols).count}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{:else if ctx}
  <div class="page"><p>{t("gb.notFound")}</p></div>
{/if}

<style>
  .wide {
    max-width: 1320px;
  }
  .back {
    display: inline-block;
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .back:hover {
    color: var(--accent);
  }
  .top {
    display: flex;
    gap: 22px;
    margin-bottom: 20px;
  }
  .portrait {
    width: 170px;
    height: 120px;
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
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    color: var(--plat);
  }
  .title {
    margin-top: 4px;
    width: 360px;
    max-width: 100%;
    padding: 4px 0;
    border: none;
    border-bottom: 1px dashed var(--line);
    background: none;
    color: var(--text);
    font-size: 15px;
    outline: none;
  }
  .title:focus {
    border-bottom-color: var(--accent);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: flex-start;
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
  .act:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .costs {
    display: flex;
    gap: 18px;
    margin-top: 12px;
    font-size: 14px;
  }
  .costs span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .costs img {
    width: 20px;
    height: 20px;
  }
  .saved {
    color: var(--good);
  }
  .mine {
    margin-top: 22px;
    max-width: 520px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .row.on {
    border-color: var(--accent);
  }
  .row .name {
    flex: 1;
  }
  .bf {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .bf img {
    width: 14px;
    height: 14px;
  }
</style>
