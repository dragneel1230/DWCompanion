<script lang="ts">
  // Arcanes rank up by fusing copies: rank r holds (r+1)(r+2)/2 copies (3, 6, 10, 15, 21 — WARFRAME wiki,
  // "Arcane Enhancement"). For the max rank: buy it ready, or a lower rank and the missing rank 0 copies.
  // Prices: in-game sellers' orders, cheapest first, as many as each one has (whole packs).
  import { num, t } from "$lib/i18n/index.svelte";
  import type { Order } from "$lib/api";
  import Cur from "./Cur.svelte";

  let { list, maxRank, subtypeOk = () => true }: { list: Order[]; maxRank: number; subtypeOk?: (o: Order) => boolean } = $props();

  const copies = (r: number) => ((r + 1) * (r + 2)) / 2;
  const need = $derived(copies(maxRank));
  const per = (o: Order) => Math.max(1, o.perTrade ?? 1);
  const sells = $derived(
    list
      .filter((o) => o.type === "sell" && o.user.status === "ingame" && o.rank != null && subtypeOk(o))
      .sort((a, b) => a.platinum / per(a) - b.platinum / per(b)),
  );

  // n rank 0 copies from the cheapest sellers: total price and sellers, or null when in-game supply is short.
  function zeros(n: number): { cost: number; from: number } | null {
    let left = n;
    let cost = 0;
    let from = 0;
    for (const o of sells) {
      if (left <= 0) break;
      if (o.rank !== 0) continue;
      const packs = Math.min(Math.floor(o.quantity / per(o)), Math.ceil(left / per(o)));
      if (packs <= 0) continue;
      cost += packs * o.platinum;
      left -= packs * per(o);
      from++;
    }
    return left > 0 ? null : { cost, from };
  }

  type Way = { r: number; base: number | null; add: number; cost: number; from: number };
  const ways = $derived.by((): Way[] => {
    const out: Way[] = [];
    for (let r = 0; r <= maxRank; r++) {
      const add = need - (r ? copies(r) : 0);
      // r = 0: every copy bought at rank 0; otherwise one ranked copy plus rank 0 copies.
      const one = r ? sells.find((o) => o.rank === r && per(o) === 1) : undefined;
      if (r && !one) continue;
      const z = add ? zeros(add) : { cost: 0, from: 0 };
      if (!z) continue;
      out.push({ r, base: one ? one.platinum : null, add, cost: (one?.platinum ?? 0) + z.cost, from: z.from + (one ? 1 : 0) });
    }
    return out;
  });
  const best = $derived(ways.length ? Math.min(...ways.map((w) => w.cost)) : 0);
  const maxWay = $derived(ways.find((w) => w.r === maxRank));
</script>

{#if maxRank > 0}
  <div class="fusion">
    <div class="head">
      <b>{t("af.title", { r: maxRank })}</b>
      <span>{t("af.need", { n: need, r: maxRank })}</span>
    </div>
    {#if ways.length}
      <div class="ways">
        {#each ways as w (w.r)}
          <div class="way" class:best={w.cost === best}>
            <span class="what">
              {#if w.r === maxRank}{t("af.ready", { r: w.r })}
              {:else if w.r === 0}{t("af.allZero", { n: w.add })}
              {:else}{t("af.mixed", { r: w.r, n: w.add })}{/if}
            </span>
            <span class="from">{t("af.sellers", { n: w.from })}</span>
            <span class="cost"><Cur kind="plat" value={num(w.cost)} size={15} /></span>
            <span class="diff">{#if w.cost === best}{t("af.best")}{:else}+{num(w.cost - best)}{/if}</span>
          </div>
        {/each}
      </div>
      {#if maxWay && maxWay.cost !== best}
        <p class="hint">{t("af.save", { v: num(maxWay.cost - best) })}</p>
      {/if}
    {:else}
      <p class="hint">{t("af.noSupply")}</p>
    {/if}
    <p class="hint">{t("af.hint", { list: Array.from({ length: maxRank }, (_, i) => `${i + 1} → ${copies(i + 1)}`).join(", ") })}</p>
  </div>
{/if}

<style>
  .fusion {
    margin-bottom: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin-bottom: 8px;
  }
  .head b {
    font-size: 14px;
    font-weight: 600;
  }
  .head span {
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .ways {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .way {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 70px 92px;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 13px;
  }
  .way.best {
    background: color-mix(in srgb, var(--good) 12%, transparent);
  }
  .from {
    font-size: 12px;
    color: var(--text-faint);
  }
  .cost {
    text-align: right;
  }
  .diff {
    text-align: right;
    font-size: 12px;
    color: var(--text-faint);
  }
  .best .diff {
    color: var(--good);
    font-weight: 600;
  }
  .hint {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-faint);
  }
</style>
