<script lang="ts">
  // Lazily loaded warframe.market price for one item slug.
  import { getPrice, cachedPrice, type Price } from "$lib/api";

  let { slug, onprice }: { slug?: string; onprice?: (p: Price | null) => void } = $props();

  let price = $state<Price | null>(null);
  let loading = $state(false);

  $effect(() => {
    if (!slug) return;
    price = cachedPrice(slug);
    if (price) {
      onprice?.(price);
      return;
    }
    loading = true;
    getPrice(slug)
      .then((p) => {
        price = p;
        onprice?.(p);
      })
      .catch(() => onprice?.(null))
      .finally(() => (loading = false));
  });
</script>

{#if !slug}
  <span class="dash">—</span>
{:else if loading}
  <span class="dash pulse">···</span>
{:else if price?.sell != null}
  <span class="plat" title="Дешевле всего у продавцов онлайн · покупатели дают {price.buy ?? '—'}">{price.sell} пл</span>
{:else}
  <span class="dash" title="Нет продавцов онлайн">—</span>
{/if}

<style>
  .plat {
    color: var(--plat);
  }
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
