<script lang="ts" module>
  // The chosen filter and sort outlive the tab (opening an item unmounts it) and the app restart.
  type Kind = "mod" | "arcane" | "set";
  type What = "all" | Kind;
  type Sort = "off" | "price";
  const KEY = "dwc.deals";
  function saved(): { what: What; sort: Sort } {
    try {
      return { what: "all", sort: "off", ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return { what: "all", sort: "off" };
    }
  }
  const view = $state(saved());
</script>

<script lang="ts">
  // «Торговля» → «Находки»: what the player lacks (mods, arcanes, prime sets) that sold yesterday well below its
  // usual price. Yesterday's deals vs the market's moving average (relics.run daily file, marketDay.ts): one
  // download a day, no warframe.market requests; live orders only when a row is opened.
  import { locale, num, t, type Key } from "$lib/i18n/index.svelte";
  import { getDb, iconUrl } from "$lib/db";
  import { loadFrames, loadOtherMods, type FramesDb, type Mod } from "$lib/frames";
  import { loadMarketDay, dayRow, marketDate, type DayRow } from "$lib/marketDay";
  import { inventory } from "$lib/inventory.svelte";
  import { owned } from "$lib/owned.svelte";
  import { isMastered, isOwned } from "$lib/ownership.svelte";
  import type { View } from "$lib/hub/hub";
  import Cur from "$lib/components/Cur.svelte";
  import ItemThumb from "$lib/components/ItemThumb.svelte";

  let { onopen }: { onopen: (v: View) => void } = $props();

  $effect(() => {
    const v = JSON.stringify(view);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // storage unavailable: the choice lives until the window closes
    }
  });
  let ready = $state(false);
  let frames = $state<FramesDb | null>(null);
  let other = $state<Record<string, Mod>>({});
  loadMarketDay().then(() => (ready = true));
  loadFrames().then((f) => (frames = f)).catch(() => {});
  loadOtherMods().then((m) => (other = m)).catch(() => {});

  // A real drop, not noise: enough deals, worth more than pocket change, at least a fifth under the usual price.
  const MIN_DEALS = 3;
  const MIN_USUAL = 4;
  const MIN_OFF = 0.2;

  type Row = { kind: Kind; id: string; name: string; icon: string | null; rank: number; price: number; usual: number; off: number; deals: number; ask: number | null };

  function deal(r: DayRow | null): Pick<Row, "price" | "usual" | "off" | "deals" | "ask"> | null {
    if (!r || r.deal == null || !r.avg || r.deals < MIN_DEALS || r.avg < MIN_USUAL) return null;
    const off = (r.avg - r.deal) / r.avg;
    return off >= MIN_OFF ? { price: r.deal, usual: r.avg, off, deals: r.deals, ask: r.ask } : null;
  }

  const have = $derived(!!inventory.data);
  const rows = $derived.by((): Row[] => {
    if (!ready || !frames) return [];
    const out: Row[] = [];
    // Same-named mods (Conclave copies etc.) share a slug: one row per slug.
    const seen = new Set<string>();
    const ranked = (kind: "mod" | "arcane", id: string, x: { name: string; icon: string | null; slug?: string; max: number }) => {
      if (!x.slug || seen.has(x.slug) || (have && owned.has(id))) return;
      seen.add(x.slug);
      // Rank 0 and max rank trade as different goods: the bigger drop of the two.
      const best = [0, x.max]
        .map((rank) => ({ rank, d: deal(dayRow(x.slug, rank)) }))
        .filter((c) => c.d)
        .sort((a, b) => b.d!.off - a.d!.off)[0];
      if (best) out.push({ kind, id, name: x.name, icon: x.icon, rank: best.rank, ...best.d! });
    };
    for (const [id, m] of [...Object.entries(frames.mods), ...Object.entries(other)]) ranked("mod", id, m);
    for (const [id, a] of Object.entries(frames.arcanes)) ranked("arcane", id, a);
    for (const [id, s] of Object.entries(getDb().sets)) {
      if (have && (isOwned(id) || isMastered(id))) continue;
      const d = deal(dayRow(s.slug, 0));
      if (d) out.push({ kind: "set", id, name: s.name, icon: s.icon, rank: 0, ...d });
    }
    return out;
  });

  const shown = $derived(
    rows
      .filter((r) => view.what === "all" || r.kind === view.what)
      .sort((a, b) => (view.sort === "off" ? b.off - a.off : a.price - b.price))
      .slice(0, 200),
  );
  const counts = $derived({
    all: rows.length,
    mod: rows.filter((r) => r.kind === "mod").length,
    arcane: rows.filter((r) => r.kind === "arcane").length,
    set: rows.filter((r) => r.kind === "set").length,
  });

  const WHATS: { id: What; label: Key }[] = [
    { id: "all", label: "deals.all" },
    { id: "mod", label: "deals.mods" },
    { id: "arcane", label: "deals.arcanes" },
    { id: "set", label: "deals.sets" },
  ];
  const date = $derived(ready && marketDate() ? new Date(marketDate()!).toLocaleDateString(locale(), { day: "numeric", month: "long" }) : "—");
  const pct = (x: number) => `−${num(Math.round(x * 100))} %`;
</script>

<section class="panel deals">
  <header>
    <div class="seg">
      {#each WHATS as w (w.id)}
        <button class:on={view.what === w.id} onclick={() => (view.what = w.id)}>{t(w.label)} · {counts[w.id]}</button>
      {/each}
    </div>
    <div class="seg">
      <button class:on={view.sort === "off"} onclick={() => (view.sort = "off")}>{t("deals.sortOff")}</button>
      <button class:on={view.sort === "price"} onclick={() => (view.sort = "price")}>{t("deals.sortPrice")}</button>
    </div>
  </header>
  {#if !have}<p class="note">{t("deals.noInv")}</p>{/if}
  <div class="cols">
    <span></span><span>{t("market.col.name")}</span><span class="r">{t("deals.col.price")}</span><span class="r" title={t("deals.col.usualHint")}>{t("deals.col.usual")}</span><span class="r">{t("deals.col.off")}</span><span class="r" title={t("deals.col.dealsHint")}>{t("deals.col.deals")}</span>
  </div>
  <div class="body">
    {#if !ready || !frames}
      <div class="empty"><span>{t("market.loading")}</span></div>
    {:else if !shown.length}
      <div class="empty"><span>{t("deals.none")}</span></div>
    {/if}
    {#each shown as r (r.kind + r.id)}
      <button class="line" onclick={() => onopen({ kind: r.kind, id: r.id })}>
        {#if r.kind === "set"}<img src={iconUrl(r.icon)} alt="" loading="lazy" />{:else}<ItemThumb id={r.id} icon={r.icon} name={r.name} w={44} />{/if}
        <span class="name">
          {r.name}
          {#if have}<i class="lack" title={t("deals.lackHint")}>{t("deals.lack")}</i>{/if}
          {#if r.kind !== "set"}<small>{t("mp.rankLower", { r: r.rank })}</small>{/if}
          {#if r.ask != null && r.ask < r.usual}<small title={t("deals.askHint")}>{t("deals.ask", { v: num(r.ask) })}</small>{/if}
        </span>
        <span class="r"><Cur kind="plat" value={num(r.price)} size={14} /></span>
        <span class="r usual">{num(Math.round(r.usual))}</span>
        <span class="r off">{pct(r.off)}</span>
        <span class="r n">{r.deals}</span>
      </button>
    {/each}
  </div>
  <p class="foot">{t("deals.foot", { date, n: MIN_DEALS, p: Math.round(MIN_OFF * 100) })}</p>
</section>

<style>
  .deals {
    height: 100%;
  }
  .deals > header {
    flex-wrap: wrap;
  }
  .note {
    margin: 0 24px 8px;
    font-size: 12.5px;
    color: var(--warn, var(--accent));
  }
  .cols,
  .line {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 70px 70px 64px 60px;
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
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 12px;
  }
  .line {
    width: 100%;
    padding: 6px 12px;
    border-radius: 10px;
    text-align: left;
  }
  .line:hover {
    background: var(--surface);
  }
  .line img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    justify-self: center;
  }
  .name {
    min-width: 0;
    font-size: 13.5px;
    color: var(--text);
  }
  .name small {
    margin-left: 8px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .lack {
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: 999px;
    font-style: normal;
    font-size: 11px;
    color: var(--accent);
    background: var(--accent-soft);
    vertical-align: 1px;
  }
  .r {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .usual,
  .n {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .off {
    font-weight: 600;
    color: var(--good);
  }
  .empty {
    display: grid;
    place-items: center;
    padding: 40px 0;
    color: var(--text-faint);
  }
  .foot {
    margin: 8px 24px 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
