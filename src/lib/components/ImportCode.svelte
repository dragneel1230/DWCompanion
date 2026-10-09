<script lang="ts">
  // Paste a build code from «Поделиться» (share.ts) -> the build saved to «Мои» and picked in «Билды».
  // Mods / arcanes this database doesn't know (a newer or older game patch) are left out, with a note.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { loadGear, inTab, type GearCtx, type GearTab } from "$lib/gear";
  import { userBuilds } from "$lib/userBuilds.svelte";
  import { gearBuilds } from "$lib/gearBuilds.svelte";
  import { decodeBuild, type Shared } from "$lib/share";
  import { pickBuild, pickGear } from "$lib/views/buildsSel.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let fdb = $state<FramesDb | null>(null);
  let ctx = $state<GearCtx | null>(null);
  loadFrames().then((d) => (fdb = d));
  loadGear().then((c) => (ctx = c)).catch(() => {});

  let code = $state("");
  let title = $state("");
  let decoded = $state<Shared | null>(null);
  let checked = $state(false);

  $effect(() => {
    const text = code.trim();
    checked = false;
    if (!text) {
      decoded = null;
      return;
    }
    let live = true;
    decodeBuild(text).then((x) => {
      if (!live) return;
      decoded = x;
      checked = true;
      if (x && !title) title = x.b.title;
    });
    return () => (live = false);
  });

  const TABS: GearTab[] = ["primary", "secondary", "melee", "exalted", "companion", "cweapon", "archwing", "archgun", "archmelee", "mech"];

  // What the code points at, with unknown ids dropped.
  const result = $derived.by(() => {
    const x = decoded;
    if (!x || !fdb) return null;
    if (x.k === "f") {
      const frame = fdb.frames[x.b.frame];
      if (!frame) return { missing: true as const };
      const known = (id: string | null | undefined) => (id && fdb!.mods[id] ? id : null);
      const slots = x.b.slots.map(known);
      const arcanes = x.b.arcanes.filter((a) => fdb!.arcanes[a]);
      const all = [x.b.aura, x.b.aura2, x.b.exilus, ...x.b.slots].filter(Boolean).length + x.b.arcanes.length;
      const kept = [known(x.b.aura), known(x.b.aura2), known(x.b.exilus), ...slots].filter(Boolean).length + arcanes.length;
      const build = { ...x.b, aura: known(x.b.aura), aura2: x.b.aura2 === undefined ? undefined : known(x.b.aura2), exilus: known(x.b.exilus), slots, arcanes };
      return { missing: false as const, k: "f" as const, name: frame.name, icon: frame.icon, build, dropped: all - kept };
    }
    if (!ctx) return null;
    const g = ctx.items[x.b.item];
    if (!g) return { missing: true as const };
    const known = (id: string | null | undefined) => (id && ctx!.mods[id] ? id : null);
    const slots = x.b.slots.map(known);
    const arcanes = x.b.arcanes.filter((a) => ctx!.arcanes[a]);
    const all = [x.b.exilus, x.b.stance, ...x.b.slots].filter(Boolean).length + x.b.arcanes.length;
    const kept = [known(x.b.exilus), known(x.b.stance), ...slots].filter(Boolean).length + arcanes.length;
    const build = { ...x.b, exilus: known(x.b.exilus), stance: known(x.b.stance), slots, arcanes };
    const tab = TABS.find((tb) => inTab(g, tb)) ?? (g.kind as GearTab);
    return { missing: false as const, k: "g" as const, name: g.name, icon: g.icon, build, tab, dropped: all - kept };
  });

  function save() {
    const r = result;
    if (!r || r.missing) return;
    const id = `sh-${Date.now()}`;
    const name = title.trim() || t("share.defaultTitle");
    if (r.k === "f") {
      userBuilds.save(id, { ...r.build, title: name, author: t("share.author"), votes: 0, tags: [], note: r.build.note ?? "" });
      pickBuild(r.build.frame, id);
    } else {
      gearBuilds.save(id, { ...r.build, title: name, author: t("share.author") });
      pickGear(r.tab, r.build.item, id);
    }
    onclose();
  }
</script>

<div class="import">
  <div class="head">
    <b>{t("share.import")}</b>
    <button class="x" onclick={onclose} aria-label={t("common.close")}>✕</button>
  </div>
  <p class="hint">{t("share.importHint")}</p>

  <!-- svelte-ignore a11y_autofocus -->
  <input bind:value={code} placeholder="DWC1.…" spellcheck="false" autofocus />

  {#if checked && !decoded}
    <p class="bad">{t("share.bad")}</p>
  {:else if result?.missing}
    <p class="bad">{t("share.unknownItem")}</p>
  {:else if result}
    <div class="target">
      {#if result.icon}<img src={iconUrl(result.icon)} alt="" />{/if}
      <span>{result.name}</span>
    </div>
    {#if result.dropped}<p class="warn">{t("share.dropped", { n: result.dropped })}</p>{/if}
    <input bind:value={title} placeholder={t("imp.nameOptional")} spellcheck="false" />
    <button class="save" onclick={save}>{t("imp.save")}</button>
  {/if}
</div>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    margin-bottom: 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
  }
  .x {
    color: var(--text-faint);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .target {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .target img {
    width: 40px;
    height: 40px;
    object-fit: contain;
  }
  .bad,
  .warn {
    margin: 0;
    color: var(--warn);
    font-size: 13px;
  }
  .save {
    align-self: flex-start;
    padding: 9px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: #14110b;
    font-weight: 600;
  }
</style>
