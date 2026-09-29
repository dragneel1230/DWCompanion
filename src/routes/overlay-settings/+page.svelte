<script lang="ts">
  // Overlay settings. Debug tools (EE.log lines, screen recording) only in development builds.
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { overlaySettings, type Priority } from "$lib/overlaySettings.svelte";

  const s = $derived(overlaySettings.value);

  const PRIORITIES: { id: Priority; label: string; hint: string; soon?: boolean }[] = [
    { id: "platinum", label: "Платина", hint: "самая дорогая на warframe.market" },
    { id: "ducats", label: "Дукаты", hint: "больше всего дукатов у Баро" },
    { id: "collection", label: "Коллекция", hint: "чего нет у тебя — после доступа к инвентарю", soon: true },
  ];

  // ---------- debug (dev builds only)
  const DEV = import.meta.env.DEV;
  type Line = { t: number; line: string; trigger: boolean };
  let lines = $state<Line[]>([]);
  let demoError = $state("");
  const un: Promise<UnlistenFn>[] = DEV ? [listen<Line>("bench-line", (e) => (lines = [e.payload, ...lines].slice(0, 100)))] : [];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));
  const time = (t: number) => new Date(t).toLocaleTimeString("ru-RU") + "." + String(t % 1000).padStart(3, "0");

  function demo() {
    demoError = "";
    invoke("overlay_demo").catch((e) => (demoError = String(e)));
  }
</script>

<div class="page">
  <h1>Оверлей</h1>

  <label class="row switch">
    <span>
      <b>Цены наград за реликвии поверх игры</b>
      <small>Показывается на экране выбора награды в разрыве Бездны</small>
    </span>
    <input type="checkbox" checked={s.enabled} onchange={(e) => overlaySettings.set({ enabled: e.currentTarget.checked })} />
  </label>

  <div class="section-title">Лучший выбор</div>
  <div class="choices" class:off={!s.enabled}>
    {#each PRIORITIES as p}
      <button class="choice" class:on={s.priority === p.id} disabled={p.soon} onclick={() => overlaySettings.set({ priority: p.id })}>
        <b>{p.label}{#if p.soon}<span class="soon">позже</span>{/if}</b>
        <small>{p.hint}</small>
      </button>
    {/each}
  </div>

  {#if DEV}
    <div class="section-title">Отладка</div>
    <div class="debug">
      <label><input type="checkbox" checked={s.record} onchange={(e) => overlaySettings.set({ record: e.currentTarget.checked })} /> Записывать экран наград и сканы на диск</label>
      <div class="actions">
        <button onclick={demo}>Показать пример</button>
        <button onclick={() => invoke("bench_test")}>Проверить захват</button>
        <button onclick={() => invoke("bench_open_dir")}>Папка сессии</button>
      </div>
      {#if demoError}<p class="err">{demoError}</p>{/if}
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
