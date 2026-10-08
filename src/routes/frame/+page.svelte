<script lang="ts">
  import { labels, num, t } from "$lib/i18n/index.svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { loadFrames, buildsFor, getBuild, emptyBuild, formaInfo, buildEndo, type Build, type FramesDb } from "$lib/frames";
  import { getDb, iconUrl, itemName } from "$lib/db";
  import { userBuilds } from "$lib/userBuilds.svelte";
  import BuildBoard from "$lib/components/BuildBoard.svelte";
  import ImportBuild from "$lib/components/ImportBuild.svelte";
  import GoalButton from "$lib/goals/GoalButton.svelte";

  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  const id = $derived(page.url.searchParams.get("id") ?? "");
  // ?build=<id> opens an existing build in the editor.
  const editId = $derived(page.url.searchParams.get("build"));
  const frame = $derived(db?.frames[id]);
  const builds = $derived(db ? buildsFor(db, id) : []);

  let build = $state<Build | null>(null);
  let title = $state("");
  let savedAt = $state(0);

  // Fresh editor state whenever the frame or the edited build changes.
  $effect(() => {
    if (!db || !frame) return;
    const src = editId ? getBuild(db, editId) : undefined;
    const base = emptyBuild(id, frame);
    const snap = src ? $state.snapshot(src) : null; // plain deep copy (src may be a $state proxy)
    build = snap ? { ...base, ...snap, pols: snap.pols ?? base.pols, ranks: snap.ranks ?? base.ranks } : base;
    title = src?.title ?? "";
  });

  const own = $derived(!!editId && !!userBuilds.all[editId]);
  const forma = $derived(frame && build ? formaInfo(frame, build.pols).count : 0);
  const endo = $derived(db && build ? buildEndo(db, build) : 0);
  const empty = $derived(!build || (!build.aura && !build.exilus && build.slots.every((s) => !s) && !build.arcanes.length));

  function save() {
    if (!build) return;
    const bid = own ? editId! : `my-${Date.now()}`;
    const prev = own ? userBuilds.all[bid] : null;
    userBuilds.save(bid, {
      ...$state.snapshot(build),
      frame: id,
      title: title.trim() || t("frame.myBuild"),
      author: prev?.author ?? t("frame.myBuildAuthor"),
      source: prev?.source,
      url: prev?.url,
      votes: 0,
    });
    savedAt = Date.now();
    if (!own) goto(`/frame?id=${encodeURIComponent(id)}&build=${encodeURIComponent(bid)}`, { replaceState: true, noScroll: true });
  }

  function reset() {
    goto(`/frame?id=${encodeURIComponent(id)}`, { noScroll: true });
    if (!editId && frame) build = emptyBuild(id, frame);
  }

  // Prime parts: from the relic db; relics that still drop go first.
  const primeParts = $derived.by(() => {
    if (!frame?.prime) return [];
    const wdb = getDb();
    const set = wdb.sets[id];
    if (!set) return [];
    return set.parts.map((pid) => {
      const it = wdb.items[pid];
      const relics = it.relics
        .map((r) => ({ ...r, vaulted: wdb.relics[r.relic]?.vaulted ?? true, name: wdb.relics[r.relic]?.s ?? r.relic }))
        .sort((a, b) => Number(a.vaulted) - Number(b.vaulted));
      return { id: pid, name: itemName(it), relics };
    });
  });
  const RARITY_RU = labels({ COMMON: "frame.rar.common", UNCOMMON: "frame.rar.uncommon", RARE: "frame.rar.rare" });

  let importing = $state(false);
</script>

{#if frame && db && build}
  <div class="page wide">
    <header class="top">
      <img class="portrait" src={iconUrl(frame.icon)} alt="" />
      <div class="head">
        <div class="title-row">
          <div>
            <h1>{frame.name}{#if frame.prime}<span class="tag prime">{t("frame.prime")}</span>{/if}</h1>
            <input class="title" bind:value={title} placeholder={editId ? t("frame.buildName") : t("frame.newBuildName")} spellcheck="false" />
          </div>
          <div class="actions">
            <GoalButton {id} />
            {#if editId}<button class="act" onclick={reset}>{t("frame.new")}</button>{/if}
            <button class="act primary" onclick={save} disabled={empty}>{own ? t("common.save") : t("frame.saveToMine")}</button>
          </div>
        </div>
        <div class="costs">
          <span title={t("frame.formaHint")}><img src="/icons/forma.png" alt={t("frame.forma")} /> {forma}</span>
          <span title={t("frame.endoHint")}><img src="/icons/endo.png" alt={t("frame.endo")} /> {num(endo)}</span>
          {#if savedAt && own}<span class="saved">{t("frame.saved")}</span>{/if}
        </div>
        <p class="desc">{frame.desc}</p>
        {#if frame.passive}<p class="passive"><b>{t("frame.passive")}</b> {frame.passive}</p>{/if}
      </div>
    </header>

    <BuildBoard {db} {frame} bind:build editable />

    <div class="cols">
      <section>
        <div class="section-title">{t("frame.parts")}</div>
        {#if frame.prime}
          {#if primeParts.length}
            <div class="parts">
              {#each primeParts as p (p.id)}
                <div class="part">
                  <a class="pname" href="/item?id={encodeURIComponent(p.id)}">{p.name}</a>
                  <div class="drops">
                    {#each p.relics as r}
                      <a class="relic" class:vaulted={r.vaulted} href="/relic?id={encodeURIComponent(r.relic)}">
                        {r.name}<small>{RARITY_RU[r.rarity]}</small>
                      </a>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
            <p class="hint">{t("frame.greyVaulted")} <a href="/set?id={encodeURIComponent(id)}">{t("frame.wholeSet")} →</a></p>
          {:else}
            <p class="muted">{t("frame.noParts")}</p>
          {/if}
        {:else}
          <div class="parts">
            {#each frame.parts as p}
              <div class="part">
                <span class="pname">{p.name}</span>
                <div class="drops list">
                  {#if p.bp && !p.drops.length && frame.bpCost}
                    <span>{t("frame.bpMarket", { v: num(frame.bpCost) })}</span>
                  {/if}
                  {#each p.drops.slice(0, 6) as d}
                    <span>{d.loc} <b>{num(d.chance, 2)}%</b></span>
                  {/each}
                  {#if p.drops.length > 6}<span class="more">{t("coll.andMore", { v: p.drops.length - 6 })}</span>{/if}
                  {#if !p.drops.length && !(p.bp && frame.bpCost)}<span class="muted">{t("frame.otherWay")}</span>{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="builds-head">
          <div class="section-title">{t("frame.builds")}</div>
          {#if !importing}<button class="import-btn" onclick={() => (importing = true)}>+ {t("frame.import")}</button>{/if}
        </div>
        {#if importing}<ImportBuild {db} frameId={id} onclose={() => (importing = false)} />{/if}
        {#if builds.length}
          <div class="rows">
            {#each builds as [bid, b] (bid)}
              <a class="row build" class:on={bid === editId} href="/build?id={encodeURIComponent(bid)}">
                <span class="name">
                  {b.title}
                  <small>{b.author}{#each b.tags as t}<span class="tag">{t}</span>{/each}</small>
                </span>
                <span class="bf" title={t("frame.forma")}><img src="/icons/forma.png" alt="" /> {formaInfo(frame, b.pols).count}</span>
                {#if b.demo}<span class="tag vaulted">{t("frame.demo")}</span>{/if}
                {#if !b.source && !userBuilds.all[bid]}<span class="votes" title={t("frame.votes")}>▲ {b.votes}</span>{/if}
              </a>
            {/each}
          </div>
        {:else}
          <p class="muted">{t("frame.noBuilds")}</p>
        {/if}
      </section>
    </div>
  </div>
{:else if db}
  <div class="page"><p>{t("frame.notFound")}</p></div>
{/if}

<style>
  .wide {
    max-width: 1320px;
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
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    color: var(--plat);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tag.prime {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.35);
    font-size: 12px;
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
    gap: 16px;
    margin: 10px 0 6px;
    font-weight: 600;
  }
  .costs span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .costs img,
  .bf img {
    width: 20px;
    height: 20px;
  }
  .saved {
    color: var(--good);
    font-weight: 400;
    font-size: 12px;
  }
  .desc,
  .passive {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-dim);
    max-width: 760px;
  }
  .passive b {
    color: var(--text);
    font-weight: 600;
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 8px;
  }
  .parts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .part {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface);
  }
  .pname {
    font-weight: 600;
  }
  a.pname:hover {
    color: var(--accent);
  }
  .drops {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    margin-top: 6px;
    font-size: 12px;
  }
  .drops.list {
    flex-direction: column;
    color: var(--text-dim);
  }
  .drops.list b {
    color: var(--text);
    font-weight: 600;
  }
  .more {
    color: var(--text-faint);
  }
  .relic {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(111, 207, 151, 0.35);
    color: var(--good);
  }
  .relic small {
    margin-left: 4px;
    color: var(--text-faint);
  }
  .relic.vaulted {
    border-color: var(--line);
    color: var(--text-faint);
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .hint a {
    color: var(--accent);
  }
  .builds-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .import-btn {
    margin-top: 16px;
    font-size: 12px;
    color: var(--accent);
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid rgba(201, 166, 107, 0.35);
  }
  .build.on {
    outline: 1px solid var(--accent);
  }
  .build small .tag {
    margin-left: 6px;
  }
  .bf {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .votes {
    width: 60px;
    text-align: right;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
