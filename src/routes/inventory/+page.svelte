<script lang="ts">
  // Inventory: mod scan of the in-game Mods screen (the user scrolls by hand, we only look).
  import { fromRust, t } from "$lib/i18n/index.svelte";
  import { loadFrames, type FramesDb } from "$lib/frames";
  import { modScan } from "$lib/modScan.svelte";
  import { owned } from "$lib/owned.svelte";

  const DEV = import.meta.env.DEV;
  let db = $state<FramesDb | null>(null);
  loadFrames().then((d) => (db = d));

  let saved = $state("");
  let undo = $state<string[] | null>(null); // marks before the last save
  const kept = $derived(modScan.found.filter((f) => f.keep).length);
  // Warframe mods are the ones builds use; the rest (weapons, companions...) are saved too.
  const isFrameMod = (ids: string[]) => !!db && ids.some((id) => db!.mods[id]);

  function save(replace: boolean) {
    const ids = modScan.keptIds();
    if (replace) {
      const lost = owned.count - ids.filter((id) => owned.has(id)).length;
      const ask = t("inv.askReplace", { n: kept }) + (lost > 0 ? ` ${t("inv.askLost", { v: lost })}` : "") + ` ${t("inv.askContinue")}`;
      if (!confirm(ask)) return;
    }
    undo = replace ? owned.replace(ids) : owned.addMany(ids);
    saved = replace ? t("inv.replaced", { n: kept }) : t("inv.added", { n: kept });
    modScan.clear();
  }

  function revert() {
    if (undo) owned.replace(undo);
    undo = null;
    saved = t("inv.reverted");
  }
</script>

<div class="page">
  <h1>{t("inv.title")}</h1>

  <div class="card">
    <div class="head">
      <span>
        <b>{t("inv.scan")}</b>
        <small>
          {t("inv.scanHint")}
        </small>
      </span>
      {#if modScan.running}
        <button class="btn stop" onclick={() => modScan.stop()}>{t("inv.stop")}</button>
      {:else}
        <button class="btn" onclick={() => modScan.start()}>{t("inv.start")}</button>
      {/if}
    </div>
    {#if modScan.running}
      <div class="status"><span class="dot"></span> {t("inv.scanning", { v: modScan.frames })}{#if modScan.frames} · {t("inv.ms", { v: modScan.ocrMs })}{/if}</div>
    {/if}
    {#if modScan.error}<p class="err">{fromRust(modScan.error)}</p>{/if}
    <p class="hint">{t("inv.windowHint", { v: owned.count })}</p>
  </div>

  {#if saved && !modScan.found.length}
    <p class="ok">
      {saved}. {t("inv.savedHint")}
      {#if undo}<button class="link" onclick={revert}>{t("inv.undo")}</button>{/if}
    </p>
  {/if}

  {#if modScan.found.length}
    <div class="section-title">{t("inv.found", { a: modScan.found.length, b: kept })}</div>
    <div class="list">
      {#each modScan.found as f (f.name)}
        <label class="mod" class:off={!f.keep}>
          <input type="checkbox" bind:checked={f.keep} />
          <span>{f.name}</span>
          {#if isFrameMod(f.ids)}<span class="tag">{t("craft.kind.frame")}</span>{/if}
        </label>
      {/each}
    </div>
    <div class="actions">
      <button class="btn" onclick={() => save(false)} disabled={!kept}>{t("inv.add")}</button>
      <button class="btn ghost" onclick={() => save(true)} disabled={!kept} title={t("inv.replaceHint")}>{t("inv.replace")}</button>
      <button class="btn ghost" onclick={() => modScan.clear()}>{t("inv.clear")}</button>
    </div>
  {/if}

  {#if DEV && modScan.unmatched.length}
    <div class="section-title">{t("inv.debug")}</div>
    <div class="raw">{modScan.unmatched.join(" · ")}</div>
  {/if}
</div>

<style>
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 16px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .head span {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  small,
  .hint {
    color: var(--text-dim);
    font-size: 12px;
    margin: 0;
  }
  .btn {
    flex: none;
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--accent);
    color: #111;
    font-weight: 600;
  }
  .btn.stop {
    background: var(--warn);
  }
  .btn.ghost {
    background: none;
    color: var(--text);
    border: 1px solid var(--line);
    font-weight: 400;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--good);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  .err {
    color: var(--warn);
    font-size: 13px;
    margin: 0;
  }
  .ok {
    color: var(--good);
    font-size: 13px;
  }
  .link {
    margin-left: 8px;
    color: var(--accent);
    text-decoration: underline;
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 6px;
  }
  .mod {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--surface);
    font-size: 13px;
    cursor: pointer;
  }
  .mod.off {
    opacity: 0.45;
  }
  .mod input {
    accent-color: var(--accent);
  }
  .mod .tag {
    margin-left: auto;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .raw {
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.6;
  }
</style>
