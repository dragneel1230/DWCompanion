<script lang="ts">
  // Hub tab "Рынок": prime sets and parts by the day's average trade price (WFInfo bulk file, no queue),
  // sortable by platinum or by ducats per platinum (what to sell to Baro). A row opens the detail
  // panel with live orders. Mods and arcanes are in the search.
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl, itemName, normalize } from "$lib/db";
  import { loadBulk, bulkSell } from "$lib/api";
  import type { View } from "./hub";
  import { tabs } from "./tabState.svelte";

  let { onopen }: { onopen: (v: View) => void } = $props();

  type What = "sets" | "parts";
  type Sort = "plat" | "ratio" | "ducats";
  let what = $state<What>("sets");
  let sort = $state<Sort>("plat");
  let ready = $state(false);
  loadBulk().then(() => (ready = true));

  const db = getDb();
  const vaultedItem = (id: string) => {
    const it = db.items[id];
    return !!it?.relics.length && it.relics.every((r) => db.relics[r.relic]?.vaulted);
  };

  type Row = { kind: "set" | "item"; id: string; name: string; ru: string; en: string; icon: string | null; plat: number | undefined; ducats: number; vaulted: boolean };
  const rows = $derived.by((): Row[] => {
    if (!ready) return [];
    if (what === "sets")
      return Object.entries(db.sets).map(([id, s]) => ({
        kind: "set", id, name: s.name, ru: s.ru, en: s.en, icon: s.icon, plat: bulkSell(s.slug),
        ducats: s.parts.reduce((n, p) => n + (db.items[p]?.ducats ?? 0), 0),
        vaulted: s.parts.every(vaultedItem),
      }));
    return Object.entries(db.items)
      .filter(([, it]) => it.slug)
      .map(([id, it]) => ({ kind: "item", id, name: itemName(it), ru: it.ru, en: it.en, icon: it.icon, plat: bulkSell(it.slug!), ducats: it.ducats ?? 0, vaulted: vaultedItem(id) }));
  });

  const ratio = (r: Row) => (r.plat ? r.ducats / r.plat : 0);
  const shown = $derived.by(() => {
    const words = normalize(tabs.marketQuery).split(" ").filter(Boolean);
    const list = rows.filter((r) => {
      if (!words.length) return true;
      const keys = `${normalize(r.ru)} ${normalize(r.en)}`.split(" ");
      return words.every((w) => keys.some((k) => k.startsWith(w)));
    });
    const key = sort === "plat" ? (r: Row) => r.plat ?? -1 : sort === "ducats" ? (r: Row) => r.ducats : ratio;
    return list.sort((a, b) => key(b) - key(a)).slice(0, 250);
  });

  const SORTS: { id: Sort; label: Key; hint: Key }[] = [
    { id: "plat", label: "market.sort.plat", hint: "market.sort.platHint" },
    { id: "ratio", label: "market.sort.ratio", hint: "market.sort.ratioHint" },
    { id: "ducats", label: "market.sort.ducats", hint: "market.sort.ducatsHint" },
  ];
  const fmtRatio = (n: number) => (n ? num(n, 1) : "—");

  export function dismiss(): boolean {
    if (tabs.marketQuery) {
      tabs.marketQuery = "";
      return true;
    }
    return false;
  }
</script>

<section class="panel market">
  <header>
    <div class="seg">
      <button class:on={what === "sets"} onclick={() => (what = "sets")}>{t("market.sets")}</button>
      <button class:on={what === "parts"} onclick={() => (what = "parts")}>{t("market.parts")}</button>
    </div>
    <input class="filter" bind:value={tabs.marketQuery} placeholder={t("market.filter")} spellcheck="false" />
    <div class="seg">
      {#each SORTS as s}
        <button class:on={sort === s.id} title={t(s.hint)} onclick={() => (sort = s.id)}>{t(s.label)}</button>
      {/each}
    </div>
  </header>
  <div class="cols">
    <span></span><span>{t("market.col.name")}</span><span class="r">{t("market.col.plat")}</span><span class="r">{t("market.col.ducats")}</span><span class="r" title={t("market.col.ratioHint")}>{t("market.col.ratio")}</span>
  </div>
  <div class="body">
    {#if !ready}
      <div class="empty"><span>{t("market.loading")}</span></div>
    {/if}
    {#each shown as r (r.kind + r.id)}
      <button class="line" onclick={() => onopen({ kind: r.kind, id: r.id })}>
        <img src={iconUrl(r.icon)} alt="" loading="lazy" />
        <span class="name">{r.name}{#if r.vaulted}<i class="vault">{t("tag.vault")}</i>{/if}</span>
        <span class="r plat">{r.plat ?? "—"}</span>
        <span class="r duc">{r.ducats || "—"}</span>
        <span class="r ratio" class:good={ratio(r) >= 10}>{fmtRatio(ratio(r))}</span>
      </button>
    {/each}
  </div>
  <p class="foot">{t("market.foot")}</p>
</section>

<style>
  .market {
    height: 100%;
  }
  .market > header {
    flex-wrap: wrap;
  }
  .filter {
    flex: 1;
    min-width: 200px;
    padding: 7px 12px;
    border-radius: 10px;
    border: 1px solid var(--glass-line);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
  }
  .filter:focus {
    outline: none;
    border-color: rgba(201, 166, 107, 0.45);
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 90px 80px 70px;
    align-items: center;
    gap: 12px;
  }
  .cols {
    padding: 4px 24px 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .line {
    width: 100%;
    padding: 6px 12px;
    border-radius: 8px;
    text-align: left;
    color: inherit;
    background: transparent;
  }
  .line:hover {
    background: var(--surface-2);
  }
  .line img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
  .name {
    font-size: 14px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .vault {
    margin-left: 8px;
    font-style: normal;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--warn);
  }
  .r {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .plat {
    font-size: 15px;
    font-weight: 600;
    color: #cfe0ff;
  }
  .duc {
    color: #e6c060;
  }
  .ratio {
    color: var(--text-dim);
  }
  .ratio.good {
    color: var(--accent);
    font-weight: 600;
  }
  .foot {
    margin: 0;
    padding: 8px 20px 12px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
</style>
