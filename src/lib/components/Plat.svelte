<script lang="ts">
  // Lazily loaded warframe.market price for one item slug.
  import { t } from "$lib/i18n/index.svelte";
  import { untrack } from "svelte";
  import { getPrice, cachedPrice, loadBulk, bulkSell, type Price } from "$lib/api";
  import Cur from "./Cur.svelte";

  let { slug, onprice, size = 15, live = false }: { slug?: string; onprice?: (p: Price | null) => void; size?: number; live?: boolean } =
    $props();

  let price = $state<Price | null>(null);
  let loading = $state(false);

  // Depends on `slug` only; the body writes state it also reads, so keep it untracked.
  $effect(() => {
    const s = slug;
    untrack(() => load(s));
  });

  // Prime parts and sets: the day's average from the bulk file, no request. `live` asks warframe.market
  // (cheapest seller online) — only where a list doesn't need dozens of requests.
  let avg = $state(false);

  function load(s: string | undefined) {
    if (!s) return;
    if (!live) {
      loading = true;
      loadBulk().then(() => {
        if (s !== slug) return;
        const b = bulkSell(s);
        if (b == null) return liveLoad(s);
        avg = true;
        price = { sell: b, buy: null, sellers: 0, at: Date.now() };
        loading = false;
        onprice?.(price);
      });
      return;
    }
    liveLoad(s);
  }

  function liveLoad(s: string) {
    avg = false;
    const cached = cachedPrice(s);
    if (cached) {
      price = cached;
      loading = false;
      onprice?.(cached);
      return;
    }
    price = null;
    loading = true;
    getPrice(s)
      .then((p) => {
        if (s !== slug) return;
        price = p;
        onprice?.(p);
      })
      .catch(() => onprice?.(null))
      .finally(() => {
        if (s === slug) loading = false;
      });
  }
</script>

{#if !slug}
  <span class="dash">—</span>
{:else if loading}
  <span class="dash pulse">···</span>
{:else if price?.sell != null}
  <span title={avg ? t("plat.avgHint") : t("plat.liveHint", { v: price.buy ?? "—" })}><Cur kind="plat" value={price.sell} {size} /></span>
{:else}
  <span class="dash" title={t("plat.none")}>—</span>
{/if}

<style>
  .dash {
    color: var(--text-faint);
  }
  .pulse {
    animation: pulse 1s infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
