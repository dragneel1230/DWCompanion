<script lang="ts">
  // Settings (the gear at the bottom of the menu): notifications (NotifySettings), hub hotkey, reward overlay, ducat kiosk, inventory
  // (what to keep, warframe-api-helper). Debug tools (EE.log lines, screen recording) only in development builds.
  import { fromRust, locale, t, type Key } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { overlaySettings, type Priority } from "$lib/overlaySettings.svelte";
  import { hubSettings, acceleratorOf, shortcutKeys, DEFAULT_SHORTCUT } from "$lib/hubSettings.svelte";
  import { appSettings } from "$lib/appSettings.svelte";
  import { updater } from "$lib/updater.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { profile } from "$lib/profile.svelte";
  import type { CollMode } from "$lib/collection/need";
  import InvAsk from "$lib/inv/InvAsk.svelte";
  import NotifySettings from "$lib/notify/NotifySettings.svelte";

  const s = $derived(overlaySettings.value);

  const PRIORITIES: { id: Priority; label: Key; hint: Key; soon?: boolean }[] = [
    { id: "platinum", label: "market.col.plat", hint: "settings.prio.platHint" },
    { id: "ducats", label: "market.col.ducats", hint: "settings.prio.ducatsHint" },
    { id: "collection", label: "nav.collection", hint: "settings.prio.collHint" },
  ];
  const COLL_MODES: { id: CollMode; label: Key; hint: Key }[] = [
    { id: "sell", label: "settings.coll.sell", hint: "settings.coll.sellHint" },
    { id: "mr", label: "settings.coll.mr", hint: "settings.coll.mrHint" },
  ];
  // What the collection priority can go on: the inventory snapshot, else (mastery mode) the public profile.
  const collSource = $derived.by((): { k: Key; v?: string; warn?: boolean } => {
    const inv = inventory.data;
    if (inv) return { k: "settings.coll.fromInv", v: new Date(inv.at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" }) };
    if (s.collMode === "mr" && profile.data && Object.keys(profile.data.xp).length) return { k: "settings.coll.fromProfile", warn: true };
    return { k: "settings.coll.none", warn: true };
  });

  // ---------- inventory: enable / disable reading, import, forget
  let asking = $state(false);
  let invNote = $state("");
  function disconnect() {
    if (!confirm(t("inv.removeAsk"))) return;
    inventory.setRisk(false);
  }
  async function pickFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file && inventory.import(await file.text())) invNote = t("inv.updated");
  }

  // ---------- hub hotkey: click the field, press the combination
  let recording = $state(false);
  function onRecordKey(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    if (e.key === "Escape") {
      recording = false;
      return;
    }
    const acc = acceleratorOf(e);
    if (!acc) return; // only modifiers so far
    recording = false;
    hubSettings.set({ shortcut: acc });
  }

  // ---------- debug (dev builds only)
  const DEV = import.meta.env.DEV;
  type Line = { t: number; line: string; trigger: boolean };
  let lines = $state<Line[]>([]);
  let demoError = $state("");
  const un: Promise<UnlistenFn>[] = DEV ? [listen<Line>("bench-line", (e) => (lines = [e.payload, ...lines].slice(0, 100)))] : [];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));
  const time = (t: number) => new Date(t).toLocaleTimeString(locale()) + "." + String(t % 1000).padStart(3, "0");

  function demo() {
    demoError = "";
    invoke("overlay_demo").catch((e) => (demoError = String(e)));
  }
</script>

<svelte:window onkeydown={onRecordKey} />

<div class="page">
  <h1>{t("nav.settings")}</h1>

  <div class="section-title first">{t("settings.app")}</div>
  <label class="row switch">
    <span>
      <b>{t("settings.tray")}</b>
      <small>{t("settings.trayHint")}</small>
    </span>
    <input type="checkbox" checked={appSettings.value.tray} onchange={(e) => appSettings.set({ tray: e.currentTarget.checked })} />
  </label>

  <div class="section-title">{t("upd.section")}</div>
  <label class="row switch">
    <span>
      <b>{t("upd.auto")}</b>
      <small>{t("upd.autoHint")}</small>
    </span>
    <input type="checkbox" checked={updater.saved.auto} onchange={(e) => updater.setAuto(e.currentTarget.checked)} />
  </label>
  <div class="links">
    <span class="ver">{t("upd.version", { v: updater.current || "…" })}</span>
    <button disabled={updater.status === "checking" || updater.status === "downloading"} onclick={() => updater.check(true)}>{t("upd.checkNow")}</button>
    {#if updater.status === "checking"}<span class="ver">{t("upd.checking")}</span>
    {:else if updater.status === "none"}<span class="ver">{t("upd.latest")}</span>
    {:else if updater.status === "available"}<button onclick={() => (updater.hidden = false)}>{t("upd.title", { v: updater.version })}</button>
    {:else if updater.status === "error"}<span class="ver">{t("upd.checkFailed")}</span>{/if}
  </div>

  <NotifySettings />

  <div class="section-title">{t("settings.overlay")}</div>
  <label class="row switch">
    <span>
      <b>{t("settings.hubOn")}</b>
      <small>{t("settings.hubHint")}</small>
    </span>
    <input type="checkbox" checked={hubSettings.value.enabled} onchange={(e) => hubSettings.set({ enabled: e.currentTarget.checked })} />
  </label>
  <div class="row switch hotkey" class:off={!hubSettings.value.enabled}>
    <span>
      <b>{t("settings.hub")}</b>
    </span>
    <button class="keys" class:rec={recording} onclick={() => (recording = !recording)} onblur={() => (recording = false)}>
      {#if recording}
        {t("settings.pressKeys")}
      {:else}
        {#each shortcutKeys(hubSettings.value.shortcut) as k}<kbd>{k}</kbd>{/each}
      {/if}
    </button>
  </div>
  {#if hubSettings.error}<p class="err hot">{fromRust(hubSettings.error)}</p>{/if}
  <div class="links">
    {#if hubSettings.value.enabled}<button onclick={() => invoke("hub_toggle")}>{t("settings.openNow")}</button>{/if}
    {#if hubSettings.value.shortcut !== DEFAULT_SHORTCUT}
      <button onclick={() => hubSettings.set({ shortcut: DEFAULT_SHORTCUT })}>{t("settings.resetKeys", { keys: DEFAULT_SHORTCUT })}</button>
    {/if}
  </div>

  <div class="section-title">{t("settings.rewards")}</div>

  <label class="row switch">
    <span>
      <b>{t("settings.rewardsOn")}</b>
      <small>{t("settings.rewardsHint")}</small>
    </span>
    <input type="checkbox" checked={s.enabled} onchange={(e) => overlaySettings.set({ enabled: e.currentTarget.checked })} />
  </label>

  <div class="section-title">{t("overlay.best")}</div>
  <div class="choices" class:off={!s.enabled}>
    {#each PRIORITIES as p}
      <button class="choice" class:on={s.priority === p.id} disabled={p.soon} onclick={() => overlaySettings.set({ priority: p.id })}>
        <b>{t(p.label)}{#if p.soon}<span class="soon">{t("settings.soon")}</span>{/if}</b>
        <small>{t(p.hint)}</small>
      </button>
    {/each}
  </div>
  {#if s.priority === "collection"}
    <div class="choices two" class:off={!s.enabled}>
      {#each COLL_MODES as m}
        <button class="choice" class:on={s.collMode === m.id} onclick={() => overlaySettings.set({ collMode: m.id })}>
          <b>{t(m.label)}</b>
          <small>{t(m.hint)}</small>
        </button>
      {/each}
    </div>
    <p class="coll-src" class:warn={collSource.warn}>
      {t(collSource.k, { v: collSource.v ?? "" })}
      {#if !inventory.data}<a href="/trade">{t("settings.coll.toInv")}</a>{/if}
    </p>
  {/if}

  <div class="section-title">{t("settings.kiosk")}</div>

  <label class="row switch">
    <span>
      <b>{t("settings.kioskOn")}</b>
      <small>{t("settings.kioskHint")}</small>
    </span>
    <input type="checkbox" checked={s.kiosk} onchange={(e) => overlaySettings.set({ kiosk: e.currentTarget.checked })} />
  </label>

  <div class="section-title">{t("inv.title")}</div>
  <div class="row switch">
    <span><b>{t("inv.opt.copies")}</b><small>{t("inv.opt.copiesHint")}</small></span>
    <div class="seg">
      {#each [0, 1, 2, 3] as n (n)}<button class:on={inventory.prefs.keepCopies === n} onclick={() => inventory.setPrefs({ keepCopies: n })}>{n}</button>{/each}
    </div>
  </div>
  <label class="row switch">
    <span><b>{t("inv.opt.goals")}</b><small>{t("inv.opt.goalsHint")}</small></span>
    <input type="checkbox" checked={inventory.prefs.keepGoals} onchange={(e) => inventory.setPrefs({ keepGoals: e.currentTarget.checked })} />
  </label>
  <label class="row switch">
    <span><b>{t("inv.opt.unbuilt")}</b><small>{t("inv.opt.unbuiltHint")}</small></span>
    <input type="checkbox" checked={inventory.prefs.keepUnbuilt} onchange={(e) => inventory.setPrefs({ keepUnbuilt: e.currentTarget.checked })} />
  </label>
  <label class="row switch">
    <span><b>{t("inv.auto")}</b><small>{t("inv.autoHint")}</small></span>
    <input type="checkbox" checked={inventory.auto} disabled={!inventory.ready} onchange={(e) => inventory.setAuto(e.currentTarget.checked)} />
  </label>
  <div class="row switch tool">
    <span><b>{t("inv.tool")}</b><small>{t("inv.toolHint")}</small></span>
  </div>
  <div class="links">
    <label class="file">{t("inv.import")}<input type="file" accept=".json,application/json" onchange={pickFile} /></label>
    {#if inventory.risk}
      <button onclick={disconnect}>{t("inv.remove")}</button>
    {:else}
      <button onclick={() => (asking = true)}>{t("inv.connect")}</button>
    {/if}
    {#if inventory.data}
      <button onclick={() => confirm(t("inv.forgetAsk")) && inventory.clear()}>{t("inv.forget")}</button>
    {/if}
  </div>
  {#if invNote}<p class="note">{invNote}</p>{/if}
  <InvAsk bind:open={asking} ondone={() => (invNote = t("inv.installed"))} />

  {#if DEV}
    <div class="section-title">{t("settings.debug")}</div>
    <div class="debug">
      <label><input type="checkbox" checked={s.record} onchange={(e) => overlaySettings.set({ record: e.currentTarget.checked })} /> {t("settings.record")}</label>
      <div class="actions">
        <button onclick={demo}>{t("settings.demo")}</button>
        <button onclick={() => invoke("bench_test")}>{t("settings.testCapture")}</button>
        <button onclick={() => invoke("bench_open_dir")}>{t("settings.sessionDir")}</button>
      </div>
      {#if demoError}<p class="err">{fromRust(demoError)}</p>{/if}
      <div class="log">
        {#each lines as l}
          <div class:trigger={l.trigger}><span class="t">{time(l.t)}</span> {l.line}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .row + .row {
    margin-top: 8px;
  }
  .hotkey.off {
    opacity: 0.45;
    pointer-events: none;
  }
  .section-title.first {
    margin-top: 8px;
  }
  .tool {
    flex-wrap: wrap;
  }
  .file {
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .file:hover {
    color: var(--text);
  }
  .file input {
    display: none;
  }
  .note {
    margin: 6px 4px 0;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 16px;
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface);
    cursor: pointer;
  }
  .switch span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .switch small,
  .choice small {
    color: var(--text-dim);
    font-size: 12px;
  }
  .hotkey {
    cursor: default;
  }
  .keys {
    flex: none;
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 110px;
    justify-content: center;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .keys:hover {
    border-color: var(--text-faint);
  }
  .keys.rec {
    border-color: var(--accent);
    color: var(--accent);
  }
  kbd {
    min-width: 22px;
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    font: 600 12px var(--font);
    color: var(--text);
    background: var(--surface-2);
  }
  .err.hot {
    margin: 8px 2px 0;
    font-size: 13px;
  }
  .ver {
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .links {
    display: flex;
    gap: 16px;
    margin: 8px 2px 0;
  }
  .links button {
    padding: 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .links button:hover {
    color: var(--text);
  }
  .switch input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .choices.two {
    grid-template-columns: repeat(2, 1fr);
    margin-top: 8px;
  }
  .coll-src {
    margin: 8px 2px 0;
    font-size: 12px;
    color: var(--text-dim);
  }
  .coll-src.warn {
    color: var(--warn);
  }
  .coll-src a {
    margin-left: 6px;
    color: var(--accent);
  }
  .choices.off {
    opacity: 0.5;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid transparent;
    text-align: left;
  }
  .choice.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .soon {
    margin-left: 6px;
    font-size: 10px;
    font-weight: 400;
    color: var(--text-faint);
    text-transform: uppercase;
  }
  .debug {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions button {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--line);
    font-size: 12px;
  }
  .err {
    margin: 0;
    color: var(--warn);
  }
  .log {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--text-dim);
  }
  .log .trigger {
    color: var(--accent);
  }
  .t {
    color: var(--text-faint);
  }
</style>
