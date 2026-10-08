<script lang="ts">
  // The market of one item next to the player's price: the best sellers and buyers in game with the
  // player's place among them, quick prices to put into the field, the closed-trade chart.
  // Opened by a click (expanding an order, picking an item for a new one): one order list request and
  // one statistics request per item, both cached.
  import { t, num } from "$lib/i18n/index.svelte";
  import { onMount } from "svelte";
  import type { Order } from "$lib/api";
  import { whisper, copyText, type TradeItem } from "$lib/whisper";
  import Cur from "$lib/components/Cur.svelte";
  import PriceChart from "./PriceChart.svelte";
  import { books, loadBook, getStats, cachedStats, position, unitOf, type Spec, type Stats } from "./market.svelte";
  import { tradeSettings } from "./settings.svelte";

  let {
    slug,
    item,
    spec,
    myName,
    onprice,
  }: { slug: string; item: TradeItem; spec: Spec; myName: string; onprice: (platinum: number) => void } = $props();

  let stats = $state<Stats | null>(null);
  let loading = $state(false);
  let range = $state<"days" | "hours">("days");
  let copied = $state<string | null>(null);

  const book = $derived(books[slug]);
  const per = $derived(Math.max(1, spec.perTrade ?? 1));
  const median = $derived(stats?.median48 ?? null);
  // No price typed yet (new order): no "you" line, no deal, no place.
  const has = $derived(spec.platinum > 0);
  const pos = $derived(book && has ? position(spec, book.list, myName, tradeSettings.v, median) : null);
  const sell = $derived(spec.type === "sell");

  async function load(fresh = false) {
    loading = true;
    await Promise.all([loadBook(slug, fresh), getStats(slug, spec).then((s) => (stats = s))]);
    loading = false;
  }
  onMount(() => {
    stats = cachedStats(slug, spec);
    if (!book || Date.now() - book.at > 60_000) void load();
    else if (!stats) void getStats(slug, spec).then((s) => (stats = s));
  });

  // Both sides with the same rank/subtype, in game (or online), the player's own orders left out.
  const live = (o: Order) => o.user.status === "ingame" || (tradeSettings.v.online && o.user.status === "online");
  const sameThing = (o: Order) => (spec.rank == null || o.rank == null || o.rank === spec.rank) && (o.subtype ?? "") === (spec.subtype ?? "");
  const side = (type: "sell" | "buy") =>
    (book?.list ?? [])
      .filter((o) => o.type === type && live(o) && sameThing(o) && o.user.ingameName !== myName)
      .sort((a, b) => (type === "sell" ? unitOf(a) - unitOf(b) : unitOf(b) - unitOf(a)))
      .slice(0, 7);
  const sellers = $derived(side("sell"));
  const buyers = $derived(side("buy"));
  const mine = $derived(unitOf(spec));

  // Where the player's own line goes in their side's list.
  const myAt = $derived.by(() => {
    const list = sell ? sellers : buyers;
    const i = list.findIndex((o) => (sell ? unitOf(o) > mine : unitOf(o) < mine));
    return i < 0 ? list.length : i;
  });

  const trade = (u: number) => Math.max(1, Math.round(u * per));
  const step = $derived(tradeSettings.v.step);
  const chips = $derived.by(() => {
    const out: { label: string; v: number; hint: string }[] = [];
    const rivals = sell ? sellers : buyers;
    const counter = sell ? buyers : sellers;
    if (rivals[0]) {
      const b = unitOf(rivals[0]);
      out.push({ label: sell ? t("trade.q.under", { s: step }) : t("trade.q.over", { s: step }), v: trade(b - (sell ? step : -step) / per), hint: t("trade.q.underHint") });
      out.push({ label: t("trade.q.match"), v: trade(b), hint: t("trade.q.matchHint") });
    }
    if (median) out.push({ label: t("trade.q.median"), v: trade(median), hint: t("trade.q.medianHint") });
    if (counter[0]) out.push({ label: sell ? t("trade.q.now") : t("trade.q.nowBuy"), v: trade(unitOf(counter[0])), hint: sell ? t("trade.q.nowHint") : t("trade.q.nowBuyHint") });
    return out;
  });

  async function copy(o: Order) {
    const ok = await copyText(whisper(o, item, "auto", 1));
    copied = ok ? o.id : null;
    setTimeout(() => copied === o.id && (copied = null), 2500);
  }
  const fmt = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
</script>

<div class="mk">
  {#if pos?.deal}
    {@const d = pos.deal}
    <div class="deal">
      <span class="ico">⚡</span>
      <span class="grow">
        {sell ? t("trade.deal.sell", { who: d.user.ingameName, p: fmt(unitOf(d)) }) : t("trade.deal.buy", { who: d.user.ingameName, p: fmt(unitOf(d)) })}
      </span>
      <button class="btn" onclick={() => copy(d)}>{copied === d.id ? t("trade.copied") : t("trade.whisper")}</button>
    </div>
  {/if}

  <div class="cols">
    <div class="book">
      <div class="bookHead">
        <span>{t("trade.book.title")}</span>
        <span class="grow"></span>
        {#if book}<span class="faint">{t("trade.book.inGame")}</span>{/if}
        <button class="link" disabled={loading} onclick={() => load(true)}>{loading ? t("trade.loading") : t("trade.refresh")}</button>
      </div>
      {#if !book && loading}
        <p class="faint">{t("trade.loading")}</p>
      {:else if book}
        <div class="sides">
          {#each [{ type: "sell" as const, list: sellers }, { type: "buy" as const, list: buyers }] as s}
            <div class="side">
              <div class="sideHead">{s.type === "sell" ? t("trade.book.sellers") : t("trade.book.buyers")}</div>
              {#each s.list as o, i (o.id)}
                {#if has && s.type === spec.type && i === myAt}
                  <div class="ln me"><span class="p">{fmt(mine)}</span><span class="who">{t("trade.book.you")}</span></div>
                {/if}
                <button class="ln" onclick={() => copy(o)} title={t("trade.book.copyHint")}>
                  <span class="p">{fmt(unitOf(o))}</span>
                  <span class="who">{copied === o.id ? t("trade.copied") : o.user.ingameName}</span>
                  <span class="q">×{o.quantity}</span>
                </button>
              {/each}
              {#if has && s.type === spec.type && myAt >= s.list.length}
                <div class="ln me"><span class="p">{fmt(mine)}</span><span class="who">{t("trade.book.you")}</span></div>
              {/if}
              {#if !s.list.length}<p class="faint small">{t("trade.book.nobody")}</p>{/if}
            </div>
          {/each}
        </div>
      {/if}
      {#if chips.length}
        <div class="chips">
          {#each chips as c}
            <button onclick={() => onprice(c.v)} title={c.hint}><span>{c.label}</span><Cur kind="plat" value={c.v} size={12} /></button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="stats">
      <div class="bookHead">
        <span>{t("trade.chart")}</span>
        <span class="grow"></span>
        <div class="seg mini">
          <button class:on={range === "hours"} onclick={() => (range = "hours")}>{t("trade.chart.48h")}</button>
          <button class:on={range === "days"} onclick={() => (range = "days")}>{t("trade.chart.90d")}</button>
        </div>
      </div>
      {#if stats}
        <PriceChart points={range === "days" ? stats.days : stats.hours} mine={has ? mine : null} hours={range === "hours"} />
        <div class="kpis">
          <span>{t("trade.stat.median")} <b>{median != null ? num(median) : "—"}</b></span>
          <span>{t("trade.stat.volume")} <b>{num(stats.volume48)}</b></span>
          {#if pos}<span>{sell ? t("trade.stat.place") : t("trade.stat.placeBuy")} <b>{pos.rank}</b> {t("trade.stat.of", { n: pos.rivals.length + 1 })}</span>{/if}
        </div>
      {:else if loading}
        <p class="faint">{t("trade.loading")}</p>
      {:else}
        <p class="faint">{t("trade.chart.none")}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .mk {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .deal {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 9px;
    background: rgba(111, 207, 151, 0.1);
    border: 1px solid rgba(111, 207, 151, 0.3);
    font-size: 13px;
  }
  .ico {
    color: var(--good);
  }
  .grow {
    flex: 1;
  }
  .btn {
    padding: 5px 11px;
    border-radius: 7px;
    background: var(--good);
    color: #0d1a12;
    font-size: 12.5px;
    font-weight: 600;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 18px;
  }
  @media (max-width: 860px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .bookHead {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .link {
    color: var(--accent);
    font-size: 11px;
    text-transform: none;
    letter-spacing: 0;
  }
  .faint {
    color: var(--text-faint);
    font-size: 12px;
    text-transform: none;
    letter-spacing: 0;
  }
  .small {
    font-size: 11.5px;
    margin: 4px 6px;
  }
  .sides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .sideHead {
    font-size: 11.5px;
    color: var(--text-dim);
    margin: 0 6px 4px;
  }
  .ln {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 3px 6px;
    border-radius: 6px;
    font-size: 12.5px;
    text-align: left;
  }
  button.ln:hover {
    background: var(--surface-2);
  }
  .ln .p {
    width: 34px;
    text-align: right;
    color: var(--plat);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .ln .who {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
  }
  .ln .q {
    color: var(--text-faint);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .ln.me {
    background: var(--accent-soft);
    outline: 1px solid rgba(201, 166, 107, 0.35);
  }
  .ln.me .who {
    color: var(--accent);
    font-weight: 500;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .chips button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 12px;
    color: var(--text-dim);
  }
  .chips button:hover {
    border-color: var(--plat);
    color: var(--text);
  }
  .kpis {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .kpis b {
    color: var(--text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .seg.mini {
    display: inline-flex;
    padding: 2px;
    border-radius: 7px;
    background: var(--surface-2);
  }
  .seg.mini button {
    padding: 2px 8px;
    border-radius: 5px;
    font-size: 11px;
    color: var(--text-faint);
    text-transform: none;
    letter-spacing: 0;
  }
  .seg.mini button.on {
    background: var(--surface);
    color: var(--text);
  }
</style>
