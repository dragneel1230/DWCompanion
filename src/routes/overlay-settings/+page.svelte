<script lang="ts">
  // Overlay settings. Debug tools (EE.log lines, screen recording) only in development builds.
  import { fromRust, locale, t, type Key } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { overlaySettings, type Priority } from "$lib/overlaySettings.svelte";
  import { hubSettings, acceleratorOf, shortcutKeys, DEFAULT_SHORTCUT } from "$lib/hubSettings.svelte";

  const s = $derived(overlaySettings.value);

  const PRIORITIES: { id: Priority; label: Key; hint: Key; soon?: boolean }[] = [
    { id: "platinum", label: "market.col.plat", hint: "settings.prio.platHint" },
    { id: "ducats", label: "market.col.ducats", hint: "settings.prio.ducatsHint" },
    { id: "collection", label: "nav.collection", hint: "settings.prio.collHint", soon: true },
  ];

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
  <h1>{t("nav.overlay")}</h1>

  <div class="row switch hotkey">
    <span>
      <b>{t("settings.hub")}</b>
      <small>{t("settings.hubHint")}</small>
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
    <button onclick={() => invoke("hub_toggle")}>{t("settings.openNow")}</button>
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

  <div class="section-title">{t("settings.kiosk")}</div>

  <label class="row switch">
    <span>
      <b>{t("settings.kioskOn")}</b>
      <small>{t("settings.kioskHint")}</small>
    </span>
    <input type="checkbox" checked={s.kiosk} onchange={(e) => overlaySettings.set({ kiosk: e.currentTarget.checked })} />
  </label>

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
