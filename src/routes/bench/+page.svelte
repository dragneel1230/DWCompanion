<script lang="ts">
  // Measurement stand (Rust side: src-tauri/src/bench.rs). Shows what the app sees in EE.log and
  // whether the reward screen got recorded.
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";

  type Status = {
    enabled: boolean;
    log_path: string;
    log_found: boolean;
    session_dir: string;
    recordings: number;
    recording: boolean;
    last_error: string | null;
  };
  type Line = { t: number; line: string; trigger: boolean };

  let status = $state<Status | null>(null);
  let lines = $state<Line[]>([]);
  const unlisten: Promise<UnlistenFn>[] = [];

  invoke<Status>("bench_status").then((s) => (status = s));
  unlisten.push(listen<Status>("bench-status", (e) => (status = e.payload)));
  unlisten.push(listen<Line>("bench-line", (e) => (lines = [e.payload, ...lines].slice(0, 200))));
  onDestroy(() => unlisten.forEach((u) => u.then((f) => f())));

  const time = (t: number) => new Date(t).toLocaleTimeString("ru-RU") + "." + String(t % 1000).padStart(3, "0");
</script>

<div class="page">
  <h1>Замеры для оверлея</h1>
  <p class="muted">
    Приложение читает только файл <code>EE.log</code> и делает снимки экрана системным API Windows. В игру ничего не
    отправляется. Когда в логе появляется экран наград за реликвии, 5 секунд экрана пишутся в папку сессии.
  </p>

  {#if status}
    <div class="card">
      <div class="kv"><span>EE.log</span><b class:ok={status.log_found} class:bad={!status.log_found}>{status.log_found ? "найден" : "не найден"}</b><code>{status.log_path}</code></div>
      <div class="kv">
        <span>Запись по триггеру</span>
        <label><input type="checkbox" checked={status.enabled} onchange={(e) => invoke<Status>("bench_set_enabled", { enabled: e.currentTarget.checked }).then((s) => (status = s))} /> включена</label>
      </div>
      <div class="kv"><span>Записей</span><b>{status.recordings}</b>{#if status.recording}<span class="rec">● идёт запись</span>{/if}</div>
      {#if status.last_error}<div class="kv"><span>Ошибка</span><b class="bad">{status.last_error}</b></div>{/if}
      <div class="actions">
        <button onclick={() => invoke("bench_test")} disabled={status.recording}>Проверить захват (5 с)</button>
        <button onclick={() => invoke("bench_open_dir")}>Открыть папку сессии</button>
      </div>
    </div>
  {/if}

  <div class="section-title">Строки лога о разломах и наградах</div>
  {#if !lines.length}<p class="muted">Пока пусто: строки появятся, когда игра их запишет.</p>{/if}
  <div class="log">
    {#each lines as l}
      <div class:trigger={l.trigger}><span class="t">{time(l.t)}</span> {l.line}</div>
    {/each}
  </div>
</div>

<style>
  h1 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    margin: 16px 0;
    border-radius: 12px;
    background: var(--surface);
  }
  .kv {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 13px;
  }
  .kv > span:first-child {
    width: 150px;
    color: var(--text-dim);
  }
  .kv code {
    color: var(--text-faint);
    font-size: 12px;
  }
  .ok {
    color: var(--good);
  }
  .bad {
    color: #ff7b6b;
  }
  .rec {
    color: #ff7b6b;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .actions button {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .actions button:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .log {
    font-family: Consolas, monospace;
    font-size: 12px;
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .log .trigger {
    color: var(--accent);
  }
  .t {
    color: var(--text-faint);
  }
</style>
