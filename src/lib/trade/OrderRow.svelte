<script lang="ts">
  // One of the player's orders: price and quantity edited in place (a draft until saved), the market
  // position after "Check market", the suggested price, quick actions; expands into the item's market.
  import { t, num } from "$lib/i18n/index.svelte";
  import type { MyOrder, WfmItem } from "$lib/wfm.svelte";
  import type { TradeItem } from "$lib/whisper";
  import { wfm } from "$lib/wfm.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import MarketThumb from "$lib/components/MarketThumb.svelte";
  import { pageOfSlug } from "$lib/itemPage";
  import ItemMarket from "./ItemMarket.svelte";
  import type { Pos } from "./market.svelte";

  let {
    o,
    it,
    names,
    pos,
    avg,
    draft,
    open,
    onDraft,
    onSave,
    onToggle,
  }: {
    o: MyOrder;
    it: WfmItem | undefined;
    names: TradeItem;
    pos: Pos | null;
    avg: number | undefined; // day average when the market wasn't checked
    draft: { platinum?: number; quantity?: number } | undefined;
    open: boolean;
    onDraft: (d: { platinum?: number; quantity?: number } | null) => void;
    onSave: () => void;
    onToggle: () => void;
  } = $props();

  const page = $derived(pageOfSlug(it?.slug));
  const price = $derived(draft?.platinum ?? o.platinum);
  const qty = $derived(draft?.quantity ?? o.quantity);
  const per = $derived(Math.max(1, o.perTrade ?? 1));
  const dirty = $derived(draft != null && (draft.platinum !== undefined || draft.quantity !== undefined));
  const sell = $derived(o.type === "sell");
  const busy = $derived(wfm.busy === o.id);
  let confirmDel = $state(false);

  const subLabel = (s: string) => t(`mp.sub.${s}` as Parameters<typeof t>[0]) || s;

  function setPrice(v: number) {
    v = Math.max(1, Math.round(v));
    const next = { ...draft, platinum: v === o.platinum ? undefined : v };
    onDraft(next.platinum === undefined && next.quantity === undefined ? null : next);
  }
  function setQty(v: number) {
    v = Math.max(1, Math.round(v));
    const next = { ...draft, quantity: v === o.quantity ? undefined : v };
    onDraft(next.platinum === undefined && next.quantity === undefined ? null : next);
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter") onSave();
    else if (e.key === "Escape") onDraft(null);
    else if (e.key === "ArrowUp") (setPrice(price + 1), e.preventDefault());
    else if (e.key === "ArrowDown") (setPrice(price - 1), e.preventDefault());
  }

  const fmt = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
  const WHY = $derived({
    undercut: sell ? "trade.why.undercut" : "trade.why.outbid",
    raise: sell ? "trade.why.raise" : "trade.why.lower",
    alone: "trade.why.alone",
    floor: sell ? "trade.why.floor" : "trade.why.ceiling",
    keep: "trade.why.keep",
  } as const);
</script>

<div class="order" class:hidden={!o.visible} class:busy class:open class:dirty>
  <div class="main">
    <div class="exp">
      <button class="chev" class:on={open} onclick={onToggle} title={t("trade.expandHint")} aria-expanded={open} aria-label={t("trade.expandHint")}>
        <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {#if page}
        <a class="pic" href={page} title={t("trade.openPage")}><MarketThumb slug={it?.slug} thumb={it?.thumb} rank={o.rank ?? undefined} /></a>
      {:else}
        <MarketThumb slug={it?.slug} thumb={it?.thumb} rank={o.rank ?? undefined} />
      {/if}
      <span class="name">
        {#if page}<a class="title link" href={page} title={t("trade.openPage")}>{it?.name ?? o.itemId}</a>{:else}<span class="title">{it?.name ?? o.itemId}</span>{/if}
        <small>
          {#if o.rank != null}<span class="chip">{t("mp.rankLower", { r: o.rank })}</span>{/if}
          {#if o.subtype}<span class="chip">{subLabel(o.subtype)}</span>{/if}
          {#if per > 1}<span class="chip">{t("mp.pack", { n: per })}</span>{/if}
          {#if !o.visible}<span class="chip off">{t("trade.hiddenTag")}</span>{/if}
        </small>
      </span>
    </div>

    <div class="mkt">
      {#if pos}
        {#if pos.deal}
          <span class="badge good" title={t("trade.dealHint")}>⚡ {sell ? t("trade.b.buyerAt", { p: fmt(pos.deal.platinum / Math.max(1, pos.deal.perTrade ?? 1)) }) : t("trade.b.sellerAt", { p: fmt(pos.deal.platinum / Math.max(1, pos.deal.perTrade ?? 1)) })}</span>
        {:else if pos.best == null}
          <span class="badge">{t("trade.b.alone")}</span>
        {:else if pos.rank === 1}
          <span class="badge good">{t("trade.b.best")}</span>
        {:else}
          <span class="badge warn">{t("trade.b.place", { n: pos.rank })} · {sell ? t("trade.b.from") : t("trade.b.upTo")} {fmt(pos.best)}</span>
        {/if}
        {#if pos.suggest != null}
          <button class="sugg" onclick={() => setPrice(pos.suggest!)} title={t(WHY[pos.why])}>→ {pos.suggest}</button>
        {/if}
      {:else if avg != null}
        <span class="faint" title={t("trade.avgHint")}>≈ {avg} {t("trade.perDay")}</span>
      {/if}
    </div>

    <div class="stepper" title={t("trade.priceHint")}>
      <button onclick={() => setPrice(price - 1)} aria-label="−1">−</button>
      <input type="number" min="1" value={price} oninput={(e) => Number(e.currentTarget.value) > 0 && setPrice(Number(e.currentTarget.value))} onkeydown={key} />
      <button onclick={() => setPrice(price + 1)} aria-label="+1">+</button>
    </div>
    <div class="qty" title={t("trade.qtyHint")}>
      <span>×</span>
      <input type="number" min="1" value={qty} oninput={(e) => Number(e.currentTarget.value) > 0 && setQty(Number(e.currentTarget.value))} onkeydown={key} />
    </div>

    <div class="acts">
      {#if dirty}
        <button class="ic save" onclick={onSave} title={t("trade.saveHint")}>✓</button>
        <button class="ic" onclick={() => onDraft(null)} title={t("trade.cancel")}>↺</button>
      {:else}
        <button class="ic" onclick={() => wfm.update(o, { visible: !o.visible })} title={o.visible ? t("orders.hideHint") : t("orders.showHint")}>
          <svg viewBox="0 0 24 24">
            {#if o.visible}<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{:else}<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1" />{/if}
          </svg>
        </button>
        <button class="ic done" onclick={() => wfm.close(o, per)} title={t("orders.closeHint")}>
          {sell ? t("orders.sold") : t("orders.bought")}
        </button>
        {#if confirmDel}
          <button class="ic bad" onclick={() => ((confirmDel = false), wfm.remove(o))} onblur={() => (confirmDel = false)}>{t("orders.sure")}</button>
        {:else}
          <button class="ic" onclick={() => (confirmDel = true)} title={t("orders.delete")}>✕</button>
        {/if}
      {/if}
    </div>
  </div>

  {#if open && it}
    <div class="detail">
      <ItemMarket
        slug={it.slug}
        item={names}
        spec={{ type: o.type, platinum: price, perTrade: o.perTrade, rank: o.rank, subtype: o.subtype }}
        myName={wfm.user?.ingameName ?? ""}
        onprice={setPrice}
      />
      <div class="foot">
        <span class="faint">{t("trade.total", { n: num(Math.floor(qty / per)) })} <Cur kind="plat" value={price * Math.floor(qty / per)} size={12} /></span>
        <a class="link" href="https://warframe.market/items/{it.slug}" target="_blank" rel="noreferrer">{t("trade.onSite")}</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .order {
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid transparent;
    transition: border-color 0.12s;
  }
  .order.open {
    border-color: var(--line);
  }
  .order.dirty {
    border-color: rgba(143, 184, 255, 0.35);
  }
  .order.hidden .main > :not(.acts) {
    opacity: 0.5;
  }
  .order.busy {
    opacity: 0.6;
    pointer-events: none;
  }
  .main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 190px 112px 64px auto;
    align-items: center;
    gap: 12px;
    padding: 7px 10px 7px 8px;
  }
  .exp {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    text-align: left;
    border-radius: 7px;
  }
  .name {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }
  .title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title.link {
    color: var(--text);
  }
  .title.link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .pic {
    display: inline-flex;
    flex: none;
  }
  .pic:hover {
    filter: brightness(1.15);
  }
  .chev {
    flex: none;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--text-faint);
  }
  .chev:hover {
    color: var(--accent);
    background: var(--surface-2);
  }
  .chev svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    transition: transform 0.15s;
  }
  .chev.on svg {
    transform: rotate(90deg);
  }
  small {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .chip {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-dim);
  }
  .chip.off {
    color: var(--warn);
  }
  .mkt {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
    min-width: 0;
  }
  .badge {
    font-size: 11.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--text-dim);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .badge.good {
    color: var(--good);
    background: rgba(111, 207, 151, 0.1);
  }
  .badge.warn {
    color: var(--warn);
    background: rgba(224, 161, 90, 0.1);
  }
  .sugg {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(143, 184, 255, 0.4);
    color: var(--plat);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .sugg:hover {
    background: rgba(143, 184, 255, 0.12);
  }
  .faint {
    font-size: 12px;
    color: var(--text-faint);
    white-space: nowrap;
  }
  .stepper {
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    overflow: hidden;
  }
  .stepper button {
    width: 26px;
    height: 30px;
    color: var(--text-faint);
    font-size: 15px;
  }
  .stepper button:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  input {
    width: 100%;
    min-width: 0;
    border: none;
    background: transparent;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-size: 13.5px;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
  .stepper input {
    color: var(--plat);
    font-weight: 600;
    height: 30px;
    outline: none;
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--text-faint);
    font-size: 12px;
  }
  .qty input {
    height: 30px;
    border: 1px solid transparent;
    border-radius: 7px;
    color: var(--text-dim);
  }
  .qty input:hover,
  .qty input:focus {
    border-color: var(--line);
    outline: none;
  }
  .acts {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
    min-width: 168px;
  }
  .ic {
    height: 28px;
    min-width: 28px;
    padding: 0 8px;
    border-radius: 7px;
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: 12.5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ic:hover {
    color: var(--text);
  }
  .ic svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .ic.done {
    color: var(--good);
  }
  .ic.bad {
    color: var(--warn);
  }
  .ic.save {
    background: var(--plat);
    color: #0b1220;
    font-weight: 700;
  }
  .detail {
    padding: 6px 14px 12px 54px;
    border-top: 1px solid var(--line);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
  }
  .foot .faint {
    display: inline-flex;
    gap: 5px;
    align-items: center;
  }
  .link {
    font-size: 12px;
    color: var(--accent);
  }
  @media (max-width: 900px) {
    .main {
      grid-template-columns: minmax(0, 1fr) 112px auto;
    }
    .mkt {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-content: flex-start;
      padding-left: 46px;
    }
    .qty {
      display: none;
    }
    .detail {
      padding-left: 14px;
    }
  }
</style>
