<script lang="ts">
  // Overlay window content (transparent, click-through, over the game). Rust shows the window when
  // the card names are read (event "reward-scan") and hides it when the reward screen closes.
  import { onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getPrice, cachedPrice, type Price } from "$lib/api";
  import { getDb } from "$lib/db";
  import { matchCard, squadRewards, type Candidate, type Match } from "$lib/rewards";

  type Card = { x: number; y: number; w: number; h: number; texts: string[] };
  type Scan = { cards: Card[]; screen_w: number; screen_h: number; scale: number; ms: number; relics: string[] };
  type Shown = { card: Card; match: Match | null; price: Price | null; vaulted: boolean };

  // Transparent page: no app background.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  let relics = $state<string[]>([]);
  let scan = $state<Scan | null>(null);
  let shown = $state<Shown[]>([]);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const dpr = window.devicePixelRatio || 1;

  // Prices of the squad's possible rewards are fetched ahead, so the reward screen needs no network.
  function prefetch(pool: Candidate[]) {
    for (const c of pool) if (c.item.slug && !cachedPrice(c.item.slug)) getPrice(c.item.slug).catch(() => {});
  }

  const vaultedItem = (id: string) => {
    const db = getDb();
    const it = db.items[id];
    return !!it?.relics.length && it.relics.every((r) => db.relics[r.relic]?.vaulted);
  };

  async function show(s: Scan) {
    scan = s;
    const pool = squadRewards(s.relics.length ? s.relics : relics);
    shown = s.cards.map((card) => {
      const match = matchCard(card.texts, pool);
      const slug = match?.cand.item.slug;
      return { card, match, price: slug ? cachedPrice(slug) : null, vaulted: match ? vaultedItem(match.cand.id) : false };
    });
    // Anything not prefetched: fetch now and fill in.
    await Promise.all(
      shown.map(async (sh, i) => {
        const slug = sh.match?.cand.item.slug;
        if (slug && !sh.price) {
          const p = await getPrice(slug).catch(() => null);
          shown[i] = { ...shown[i], price: p };
        }
      }),
    );
    clearTimeout(hideTimer);
    // The reward screen stays up for its 15 s countdown; the log line about closing can lag seconds.
    hideTimer = setTimeout(close, 16_000);
  }

  function close() {
    scan = null;
    shown = [];
    invoke("overlay_hide");
  }

  // Best pick: most platinum; without prices, most ducats.
  const best = $derived.by(() => {
    let bi = -1;
    let bv = -1;
    shown.forEach((s, i) => {
      const v = (s.price?.sell ?? 0) * 1000 + (s.match?.cand.item.ducats ?? 0);
      if (s.match && v > bv) (bv = v), (bi = i);
    });
    return bi;
  });

  const un: Promise<UnlistenFn>[] = [
    listen<string[]>("squad-relics", (e) => {
      relics = e.payload;
      prefetch(squadRewards(relics));
    }),
    listen<string[]>("reward-open", (e) => prefetch(squadRewards(e.payload))),
    listen<Scan>("reward-scan", (e) => show(e.payload)),
    listen("reward-close", close),
  ];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));
</script>

{#if scan}
  {#each shown as s, i}
    {@const top = (560 * scan.scale) / dpr}
    <div class="panel" class:best={i === best} style:left="{s.card.x / dpr}px" style:top="{top}px" style:width="{s.card.w / dpr}px">
      {#if s.match}
        <div class="price">
          {#if s.price?.sell != null}
            <img src="/icons/platinum.png" alt="" /><b>{s.price.sell}</b>
          {:else if s.match.cand.item.slug}
            <span class="muted">…</span>
          {:else}
            <span class="muted">не продаётся</span>
          {/if}
          {#if s.match.cand.item.ducats}<span class="ducats"><img src="/icons/ducats.png" alt="" />{s.match.cand.item.ducats}</span>{/if}
        </div>
        <div class="name" title={s.card.texts.join(" / ")}>{s.match.cand.name}</div>
        <div class="tags">
          {#if i === best}<span class="pick">Бери</span>{/if}
          {#if s.vaulted}<span class="vault">в хранилище</span>{/if}
          {#if s.match.score < 0.7}<span class="unsure">не уверен</span>{/if}
        </div>
      {:else}
        <div class="muted">не распознано</div>
      {/if}
    </div>
  {/each}
{/if}

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }
  .panel {
    position: fixed;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(12, 14, 20, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e6e8ee;
    font-family: "Segoe UI", system-ui, sans-serif;
    text-align: center;
  }
  .panel.best {
    border-color: #c9a66b;
    box-shadow: 0 0 0 1px rgba(201, 166, 107, 0.5), 0 0 18px rgba(201, 166, 107, 0.35);
  }
  .price {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 20px;
  }
  .price img {
    width: 20px;
    height: 20px;
  }
  .price b {
    font-weight: 700;
    color: #8fb8ff;
  }
  .ducats {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
    font-size: 15px;
    color: #e0b84f;
  }
  .ducats img {
    width: 16px;
    height: 16px;
  }
  .name {
    max-width: 100%;
    font-size: 11px;
    color: #8b92a3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
    font-size: 11px;
  }
  .pick {
    padding: 1px 8px;
    border-radius: 999px;
    background: #c9a66b;
    color: #0e1014;
    font-weight: 700;
  }
  .vault {
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid rgba(224, 161, 90, 0.5);
    color: #e0a15a;
  }
  .unsure {
    color: #8b92a3;
  }
  .muted {
    color: #8b92a3;
    font-size: 13px;
  }
</style>
