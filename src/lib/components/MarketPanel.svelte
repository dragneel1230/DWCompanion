<script lang="ts">
  // warframe.market orders for one item: who sells / buys, and a button that copies the
  // ready-made in-game whisper. Nothing is sent anywhere by us; the user pastes it in chat.
  import { labels, num, t } from "$lib/i18n/index.svelte";
  import { onDestroy, untrack } from "svelte";
  import { getOrders, type Order, type UserStatus } from "$lib/api";
  import { whisper, copyText, type TradeItem } from "$lib/whisper";
  import Cur from "./Cur.svelte";

  let { slug, item, maxRank = 0, unranked = false }: { slug: string; item: TradeItem; maxRank?: number; unranked?: boolean } = $props();

  type Side = "sell" | "buy";
  type StatusFilter = "ingame" | "online" | "all";
  type RankFilter = "any" | "max" | "zero";

  let list = $state<Order[]>([]);
  let loading = $state(true);
  let error = $state("");
  let loadedAt = $state(0);
  let now = $state(Date.now());

  let side = $state<Side>("sell");
  let status = $state<StatusFilter>("ingame");
  let rank = $state<RankFilter>("any");
  let subtype = $state<string>("all");
  let ruForRu = $state(true);
  let shown = $state(15);

  let copiedId = $state<string | null>(null);
  // Trades are counted in packs: an order with perTrade 6 is bought 6 at a time.
  const per = (o: Order) => Math.max(1, o.perTrade ?? 1);
  const unit = (o: Order) => o.platinum / per(o);
  const maxPacks = (o: Order) => Math.max(1, Math.floor(o.quantity / per(o)));
  let packsById = $state<Record<string, number>>({});
  const packsOf = (o: Order) => Math.min(packsById[o.id] ?? 1, maxPacks(o));
  function step(o: Order, d: number) {
    packsById = { ...packsById, [o.id]: Math.max(1, Math.min(maxPacks(o), packsOf(o) + d)) };
  }
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : num(n, 1));
  let toast = $state<string | null>(null);
  let toastOk = $state(true);
  let toastTimer: ReturnType<typeof setTimeout>;

  async function load(fresh = false) {
    loading = true;
    try {
      list = await getOrders(slug, fresh);
      loadedAt = Date.now();
      error = "";
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    slug;
    untrack(() => {
      shown = 15;
      subtype = "all";
      // Mods trade mostly maxed or unranked; start from maxed unless asked otherwise (Baro sells them unranked).
      rank = maxRank > 0 ? (unranked ? "zero" : "max") : "any";
      load();
    });
  });

  const clock = setInterval(() => (now = Date.now()), 5000);
  onDestroy(() => {
    clearInterval(clock);
    clearTimeout(toastTimer);
  });

  const STATUS_RANK: Record<UserStatus, number> = { ingame: 0, online: 1, offline: 2 };
  const statusOk = (o: Order) =>
    status === "all" || o.user.status === "ingame" || (status === "online" && o.user.status === "online");
  const rankOk = (o: Order) =>
    rank === "any" || o.rank == null || (rank === "max" ? o.rank === maxRank : o.rank === 0);
  const subtypeOk = (o: Order) => subtype === "all" || o.subtype === subtype;

  const subtypes = $derived([...new Set(list.map((o) => o.subtype).filter(Boolean))] as string[]);

  const filtered = $derived.by(() => {
    const rows = list.filter((o) => o.type === side && statusOk(o) && rankOk(o) && subtypeOk(o));
    const dir = side === "sell" ? 1 : -1;
    return rows.sort(
      (a, b) =>
        dir * (unit(a) - unit(b)) ||
        STATUS_RANK[a.user.status] - STATUS_RANK[b.user.status] ||
        b.user.reputation - a.user.reputation,
    );
  });

  // Summary always over in-game players with the chosen rank/subtype, independent of the tab.
  const summary = $derived.by(() => {
    const live = list.filter((o) => o.user.status === "ingame" && rankOk(o) && subtypeOk(o));
    const sells = live.filter((o) => o.type === "sell").map(unit).sort((a, b) => a - b);
    const buys = live.filter((o) => o.type === "buy").map(unit).sort((a, b) => b - a);
    const five = sells.slice(0, 5);
    return {
      buyNow: sells[0] != null ? fmt(sells[0]) : null,
      sellNow: buys[0] != null ? fmt(buys[0]) : null,
      avg5: five.length ? Math.round(five.reduce((s, x) => s + x, 0) / five.length) : null,
      sellers: sells.length,
      buyers: buys.length,
    };
  });

  const counts = $derived({
    sell: list.filter((o) => o.type === "sell" && statusOk(o) && rankOk(o) && subtypeOk(o)).length,
    buy: list.filter((o) => o.type === "buy" && statusOk(o) && rankOk(o) && subtypeOk(o)).length,
  });

  async function act(o: Order) {
    const text = whisper(o, item, ruForRu ? "auto" : "en", packsOf(o));
    const ok = await copyText(text);
    copiedId = ok ? o.id : null;
    toast = text;
    toastOk = ok;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
      copiedId = null;
    }, 6000);
  }

  function ago(iso: string): string {
    const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    if (min < 60) return t("unit.minutes", { v: min });
    const h = Math.round(min / 60);
    if (h < 48) return t("unit.hours", { v: h });
    return t("unit.days", { v: Math.round(h / 24) });
  }

  const STATUS_RU = labels<UserStatus>({ ingame: "mp.status.ingame", online: "mp.status.online", offline: "mp.status.offline" });
  const SUB_RU: Record<string, string> = labels({ intact: "mp.sub.intact", exceptional: "mp.sub.exceptional", flawless: "mp.sub.flawless", radiant: "mp.sub.radiant" });
</script>

<section class="market">
  <div class="head">
    <div class="section-title">{t("mp.title")}</div>
    <button class="refresh" onclick={() => load(true)} disabled={loading} title={t("mp.refresh")}>
      {loading ? t("common.loading") : `↻ ${loadedAt ? t("mp.secondsAgo", { v: Math.max(0, Math.round((now - loadedAt) / 1000)) }) : ""}`}
    </button>
  </div>

  <div class="summary">
    <div class="stat" title={t("mp.buyNowHint")}>
      <span>{t("mp.buyNow")}</span>
      <b>{#if summary.buyNow != null}<Cur kind="plat" value={summary.buyNow} size={18} />{:else}—{/if}</b>
    </div>
    <div class="stat" title={t("mp.sellNowHint")}>
      <span>{t("mp.sellNow")}</span>
      <b>{#if summary.sellNow != null}<Cur kind="plat" value={summary.sellNow} size={18} />{:else}—{/if}</b>
    </div>
    <div class="stat" title={t("mp.avgHint")}>
      <span>{t("mp.avg")}</span>
      <b>{#if summary.avg5 != null}<Cur kind="plat" value={summary.avg5} size={18} />{:else}—{/if}</b>
    </div>
    <div class="stat">
      <span>{t("mp.inGame")}</span>
      <b class="small">{t("mp.sellersBuyers", { s: summary.sellers, b: summary.buyers })}</b>
    </div>
  </div>

  <div class="controls">
    <div class="seg big">
      <button class:on={side === "sell"} onclick={() => ((side = "sell"), (shown = 15))}>{t("mp.selling")} · {counts.sell}</button>
      <button class:on={side === "buy"} onclick={() => ((side = "buy"), (shown = 15))}>{t("mp.buying")} · {counts.buy}</button>
    </div>
    <div class="seg">
      <button class:on={status === "ingame"} onclick={() => (status = "ingame")}>{t("mp.inGame")}</button>
      <button class:on={status === "online"} onclick={() => (status = "online")}>{t("mp.plusOnline")}</button>
      <button class:on={status === "all"} onclick={() => (status = "all")}>{t("mp.all")}</button>
    </div>
    {#if maxRank > 0}
      <div class="seg">
        <button class:on={rank === "max"} onclick={() => (rank = "max")}>{t("mp.rank", { r: maxRank })}</button>
        <button class:on={rank === "zero"} onclick={() => (rank = "zero")}>{t("mp.rank", { r: 0 })}</button>
        <button class:on={rank === "any"} onclick={() => (rank = "any")}>{t("mp.anyRank")}</button>
      </div>
    {/if}
    {#if subtypes.length > 1}
      <div class="seg">
        <button class:on={subtype === "all"} onclick={() => (subtype = "all")}>{t("mp.all")}</button>
        {#each subtypes as st}
          <button class:on={subtype === st} onclick={() => (subtype = st)}>{SUB_RU[st] ?? st}</button>
        {/each}
      </div>
    {/if}
    <label class="lang" title={t("mp.ruForRuHint")}>
      <input type="checkbox" bind:checked={ruForRu} /> {t("mp.ruForRu")}
    </label>
  </div>

  {#if error}
    <p class="muted">{t("mp.error", { error })}</p>
  {:else if !loading && !filtered.length}
    <p class="muted">{t("mp.empty")}</p>
  {/if}

  <div class="orders">
    {#each filtered.slice(0, shown) as o (o.id)}
      <div class="order" class:copied={copiedId === o.id}>
        <span class="dot s-{o.user.status}" title={STATUS_RU[o.user.status]}></span>
        <span class="who">
          <span class="nick">{o.user.ingameName}</span>
          <small>
            {STATUS_RU[o.user.status]} · ♥ {o.user.reputation} · {ago(o.updatedAt)}
            {#if o.user.locale === "ru"}<span class="tag ru">RU</span>{/if}
          </small>
        </span>
        <span class="meta">
          {#if o.rank != null}<span class="tag">{t("mp.rankLower", { r: o.rank })}</span>{/if}
          {#if o.subtype}<span class="tag">{SUB_RU[o.subtype] ?? o.subtype}</span>{/if}
          {#if per(o) > 1}<span class="tag pack" title={t("mp.packHint", { n: per(o) })}>{t("mp.pack", { n: per(o) })}</span>{/if}
          {#if maxPacks(o) > 1}
            <span class="stepper" title={t(per(o) > 1 ? (o.type === "sell" ? "mp.stepPacksBuy" : "mp.stepPacksSell") : o.type === "sell" ? "mp.stepPcsBuy" : "mp.stepPcsSell", { q: o.quantity })}>
              <button onclick={() => step(o, -1)} disabled={packsOf(o) <= 1}>−</button>
              <span>{t("mp.ofTotal", { a: packsOf(o) * per(o), b: o.quantity })}</span>
              <button onclick={() => step(o, 1)} disabled={packsOf(o) >= maxPacks(o)}>+</button>
            </span>
          {:else if o.quantity > 1}
            <span class="qty">×{o.quantity}</span>
          {/if}
        </span>
        <span class="price">
          <Cur kind="plat" value={o.platinum * packsOf(o)} size={16} />
          {#if packsOf(o) * per(o) > 1}<small>{t("mp.perPiece", { v: fmt(unit(o)) })}</small>{/if}
        </span>
        <button class="act {o.type}" onclick={() => act(o)}>
          {copiedId === o.id ? `✓ ${t("mp.copied")}` : o.type === "sell" ? t("mp.buy") : t("mp.sell")}
        </button>
      </div>
    {/each}
  </div>
  {#if filtered.length > shown}
    <button class="more" onclick={() => (shown += 25)}>{t("mp.more", { v: filtered.length - shown })}</button>
  {/if}
</section>

{#if toast}
  <div class="toast" role="status">
    {#if toastOk}
      <b>{t("mp.copiedHint")}</b>
    {:else}
      <b class="bad">{t("mp.copyFailed")}</b>
    {/if}
    <code>{toast}</code>
  </div>
{/if}

<style>
  .market {
    margin-top: 8px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .refresh {
    margin-top: 16px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--surface);
  }
  .stat span {
    font-size: 11px;
    color: var(--text-faint);
  }
  .stat b {
    font-size: 18px;
    font-weight: 600;
  }
  .stat b.small {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-dim);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .seg {
    display: flex;
    gap: 2px;
    background: var(--surface);
    padding: 3px;
    border-radius: 9px;
  }
  .seg button {
    padding: 5px 10px;
    border-radius: 7px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .seg.big button {
    font-size: 13px;
    padding: 6px 14px;
  }
  .seg button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .lang {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .orders {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .order {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--surface);
    transition: background 0.2s;
  }
  .order:hover {
    background: var(--surface-2);
  }
  .order.copied {
    background: rgba(111, 207, 151, 0.1);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .s-ingame {
    background: #a78bfa;
    box-shadow: 0 0 6px rgba(167, 139, 250, 0.7);
  }
  .s-online {
    background: var(--good);
  }
  .s-offline {
    background: var(--text-faint);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .nick {
    font-weight: 500;
  }
  .who small {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .tag.ru {
    padding: 0 5px;
    font-size: 10px;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .qty {
    font-size: 12px;
    color: var(--text-dim);
  }
  .tag.pack {
    color: var(--warn);
    border-color: rgba(224, 161, 90, 0.35);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: var(--bg);
    font-size: 12px;
    color: var(--text-dim);
  }
  .stepper span {
    min-width: 46px;
    text-align: center;
  }
  .stepper button {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    color: var(--text);
  }
  .stepper button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .stepper button:disabled {
    color: var(--text-faint);
    cursor: default;
  }
  .price {
    width: 72px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 15px;
    font-weight: 600;
  }
  .price small {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-faint);
  }
  .act {
    width: 118px;
    padding: 7px 0;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .act.sell {
    background: rgba(143, 184, 255, 0.14);
    color: var(--plat);
  }
  .act.buy {
    background: rgba(201, 166, 107, 0.16);
    color: var(--accent);
  }
  .order.copied .act {
    background: rgba(111, 207, 151, 0.18);
    color: var(--good);
  }
  .more {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    max-width: min(760px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #10151c;
    border: 1px solid rgba(111, 207, 151, 0.4);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    z-index: 20;
    font-size: 13px;
  }
  .toast b {
    color: var(--good);
    font-weight: 600;
  }
  .toast b.bad {
    color: var(--warn);
  }
  .toast code {
    user-select: all;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    color: var(--text-dim);
    word-break: break-all;
  }
</style>
