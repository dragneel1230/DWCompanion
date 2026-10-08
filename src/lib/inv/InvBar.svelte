<script lang="ts">
  // Head of the inventory sections ("Торговля", "Реликвии"): how fresh the snapshot is, the numbers the
  // section passes in, refresh / connect / import. Without a snapshot: what the section gains from one.
  import type { Snippet } from "svelte";
  import { fromRust, locale, t, type Key } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import { invView } from "./invView.svelte";
  import InvAsk from "./InvAsk.svelte";

  let {
    title,
    lead,
    compact = false,
    children,
  }: { title: Key; lead: Key; compact?: boolean; children?: Snippet } = $props();

  const inv = $derived(inventory.data);
  let asking = $state(false);
  let note = $state("");

  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(id);
  });
  const when = (ms: number) => new Date(ms).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const ago = (ms: number) => {
    const m = Math.max(0, Math.round((now - ms) / 60_000));
    return m < 60 ? t("coll.minAgo", { v: m }) : m < 48 * 60 ? t("coll.hAgo", { v: Math.round(m / 60) }) : when(ms);
  };
  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale(), { day: "numeric", month: "long" });

  async function refresh() {
    note = "";
    if (await inventory.refresh()) note = t("inv.updated");
  }
  async function pickFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file && inventory.import(await file.text())) note = t("inv.updated");
  }
  const errText = (e: string) => (e.startsWith("rust.") ? fromRust(e) : t(e as Key));
</script>

{#snippet fileButton()}
  <label class="btn ghost file">
    {t("inv.import")}
    <input type="file" accept=".json,application/json" onchange={pickFile} />
  </label>
{/snippet}

{#snippet refreshButton()}
  {#if inventory.ready}
    <button class="btn" onclick={refresh} disabled={inventory.busy}>{inventory.busy ? t("inv.refreshing") : t("inv.refresh")}</button>
  {:else}
    <button class="btn" onclick={() => (asking = true)}>{t("inv.connect")}</button>
  {/if}
{/snippet}

{#if !inv}
  <section class="panel bar onboard" class:compact>
    <div class="who">
      <h1>{t(title)}</h1>
      <p class="lead">{t(lead)}</p>
    </div>
    <div class="go">
      {@render refreshButton()}
      {@render fileButton()}
    </div>
    <p class="hint">{inventory.ready ? t("inv.refreshHint") : t("inv.connectHint")}</p>
  </section>
{:else}
  <section class="panel bar" class:compact>
    <div class="who">
      <h1>{t(title)}</h1>
      <p class="meta">
        {t("inv.at", { v: ago(inv.at) })}
        {#if inventory.auto}<span class="auto">● {t("inv.autoOn")}</span>{/if}
      </p>
      {#if !compact}
        <p class="src">{#if invView.mdate}{t("inv.src", { d: dayName(invView.mdate) })}{:else}{t("inv.srcLoading")}{/if}</p>
      {/if}
    </div>
    <div class="kpis">{@render children?.()}</div>
    <div class="go">
      {@render refreshButton()}
      {#if inventory.ready}
        <label class="sw" title={t("inv.autoHint")}>
          <input type="checkbox" checked={inventory.auto} onchange={(e) => inventory.setAuto(e.currentTarget.checked)} />
          <span>{t("inv.auto")}</span>
        </label>
      {:else}
        {@render fileButton()}
      {/if}
    </div>
  </section>
{/if}
{#if inventory.error}<p class="err">{errText(inventory.error)}</p>{/if}
{#if note}<p class="ok">{note}</p>{/if}

<InvAsk bind:open={asking} ondone={() => (note = t("inv.installed"))} />

<style>
  .bar {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    padding: 18px 22px;
  }
  .bar.compact {
    grid-template-columns: 170px minmax(0, 1fr) auto;
    gap: 14px;
    padding: 12px 16px;
  }
  @media (max-width: 1000px) {
    .bar {
      grid-template-columns: 1fr;
    }
  }
  .onboard {
    grid-template-columns: minmax(0, 1fr) auto;
    background: linear-gradient(140deg, rgba(201, 166, 107, 0.1), var(--glass) 50%);
  }
  .onboard .hint {
    grid-column: 1 / -1;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }
  /* In the hub the tab already names the section. */
  .compact:not(.onboard) h1 {
    display: none;
  }
  .compact h1 {
    font-size: 18px;
  }
  .lead {
    margin: 4px 0 0;
    max-width: 720px;
    color: var(--text-dim);
    font-size: 13px;
    line-height: 1.5;
  }
  .meta {
    margin: 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .auto {
    margin-left: 8px;
    color: var(--good);
    font-size: 12px;
  }
  .src {
    margin: 4px 0 0;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--text-faint);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .kpis:empty {
    display: none;
  }
  .go {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .btn {
    flex: none;
    padding: 8px 16px;
    border-radius: 9px;
    background: var(--accent);
    color: #111;
    font-weight: 600;
    font-size: 13px;
    text-align: center;
  }
  .btn.ghost {
    background: none;
    color: var(--text);
    border: 1px solid var(--line);
    font-weight: 400;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .file {
    cursor: pointer;
  }
  .file input {
    display: none;
  }
  .sw {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .sw input {
    accent-color: var(--good);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.45;
  }
  .err {
    margin: 0;
    color: var(--warn);
    font-size: 13px;
  }
  .ok {
    margin: 0;
    color: var(--good);
    font-size: 13px;
  }

  /* KPI tiles the sections pass in */
  .kpis :global(.kpi) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    min-width: 0;
  }
  .kpis :global(.kpi.main) {
    background: linear-gradient(150deg, rgba(143, 184, 255, 0.12), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(143, 184, 255, 0.18);
  }
  .kpis :global(.kpi small) {
    font-size: 11px;
    color: var(--text-dim);
  }
  .kpis :global(.kpi b) {
    font-size: 18px;
    font-weight: 600;
  }
  .kpis :global(.kpi.main b) {
    font-size: 22px;
  }
  .compact .kpis :global(.kpi b) {
    font-size: 15px;
  }
  .compact .kpis :global(.kpi.main b) {
    font-size: 17px;
  }
  .kpis :global(.kpi i) {
    font-style: normal;
    font-size: 11px;
    color: var(--text-faint);
  }
  .kpis :global(.kpi .pair) {
    display: flex;
    gap: 10px;
    font-size: 14px;
  }
</style>
