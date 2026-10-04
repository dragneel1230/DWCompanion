<script lang="ts">
  // Ducat kiosk hints in the overlay window (kiosk.rs reads the screen, kiosk.ts matches the tiles).
  // Kept out of the way: a small pill in each tile's top right corner (the game draws the copy count
  // top left and the "picked" mark in the very corner), a one-line legend in the empty strip above
  // the grid, and the market worth of the picked parts next to the kiosk's own "Total".
  // Hidden while the grid scrolls, while the game is not focused and while the hub is open.
  import { num, t } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { loadBulk } from "$lib/api";
  import { client } from "$lib/clientLang.svelte";
  import { loadMastery, type MasteryDb } from "$lib/mastery";
  import { profile } from "$lib/profile.svelte";
  import { readTiles, readPicked, debug, type KioskFrame, type Tile, type Picked } from "$lib/kiosk";
  import { readOverlaySettings } from "$lib/overlaySettings.svelte";

  let frame = $state<KioskFrame | null>(null);
  let tiles = $state<Tile[]>([]);
  let picked = $state<Picked[]>([]);
  let moving = $state(false);
  let unfocused = $state(false);
  let hub = $state(false);
  let mdb: MasteryDb | null = null;
  const dpr = window.devicePixelRatio || 1;

  async function show(f: KioskFrame) {
    if (!readOverlaySettings().kiosk) return;
    await loadBulk();
    mdb ??= await loadMastery().catch(() => null);
    const p = profile.data;
    tiles = readTiles(f, client.lang, mdb, p);
    picked = readPicked(f, client.lang, mdb, p, tiles);
    if (import.meta.env.DEV) (window as unknown as { kioskDebug: unknown }).kioskDebug = { frame: f, matches: debug };
    frame = f;
    moving = false;
  }
  function close() {
    frame = null;
    tiles = [];
    picked = [];
  }

  const un: Promise<UnlistenFn>[] = [
    listen<KioskFrame>("kiosk-frame", (e) => show(e.payload)),
    listen("kiosk-moving", () => (moving = true)),
    listen("kiosk-close", close),
    listen<boolean>("kiosk-focus", (e) => (unfocused = !e.payload)),
    listen<boolean>("hub-shown", (e) => (hub = e.payload)),
  ];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));

  const s = $derived(frame ? frame.h / 1080 : 1);
  // Frame pixels -> CSS pixels of the overlay (primary monitor, origin 0,0).
  const px = (v: number, origin: number) => (v + origin) / dpr;
  const pickedPlat = $derived(picked.reduce((n, p) => n + (p.plat ?? 0), 0));
  const pickedNeeded = $derived(picked.filter((p) => p.needed).length);
  const pickedDucats = $derived(picked.reduce((n, p) => n + (p.item.ducats ?? 0), 0));
</script>

{#if frame && !unfocused && !hub}
  <div class="kiosk" class:moving style:--k={s / dpr}>
    <div class="legend" style:left="{px(frame.ox + 150 * s, frame.left)}px" style:top="{px(150 * s, frame.top)}px">
      <b>DW</b>
      <span><i class="dot ducats"></i>{t("kiosk.legend.ducats")}</span>
      <span><i class="dot plat"></i>{t("kiosk.legend.plat")}</span>
      <span><i class="dot mr"></i>{t("kiosk.legend.mr")}</span>
    </div>

    {#each tiles as tile (tile.id + tile.x + tile.y)}
      <div
        class="pill {tile.verdict}"
        style:left="{px(tile.x + tile.size - 30 * s, frame.left)}px"
        style:top="{px(tile.y + 7 * s, frame.top)}px"
      >
        <i class="dot {tile.verdict}"></i>
        <!-- Price first: "MR 39" next to each other would read as a mastery rank. -->
        {#if tile.plat != null}
          <span>{tile.plat}</span><img src="/icons/platinum.png" alt="" />
        {:else}
          <span class="dim">{tile.built ? t("kiosk.built") : t("kiosk.noPrice")}</span>
        {/if}
        {#if tile.verdict === "mr"}
          <i class="sep"></i><b class="mr">MR</b>
        {:else if tile.spare}
          <i class="sep"></i><b class="mr small" title={t("kiosk.spare")}>{t("kiosk.spareShort")}</b>
        {/if}
      </div>
    {/each}

    {#if picked.length}
      <div class="sum" style:left="{px(frame.ox + 1468 * s, frame.left)}px" style:top="{px(856 * s, frame.top)}px">
        <span>{t("kiosk.worth", { plat: num(pickedPlat) })}<img src="/icons/platinum.png" alt="" /></span>
        {#if pickedPlat && pickedDucats}<span class="dim">{t("kiosk.ratio", { r: num(pickedDucats / pickedPlat, 1) })}</span>{/if}
        {#if pickedNeeded}<span class="warn">{t("kiosk.neededPicked", { n: pickedNeeded })}</span>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .kiosk {
    font-family: Bahnschrift, "Segoe UI", system-ui, sans-serif;
    color: #e9e4d8;
    transition: opacity 0.12s;
    --green: #6fd88a;
    --amber: #f0b955;
    --blue: #8fc8ff;
  }
  .kiosk.moving {
    opacity: 0;
  }
  .legend,
  .pill,
  .sum {
    position: fixed;
    display: flex;
    align-items: center;
    white-space: nowrap;
    animation: in 0.18s ease-out both;
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
  .legend {
    gap: calc(14px * var(--k));
    height: calc(26px * var(--k));
    padding: 0 calc(12px * var(--k));
    border-radius: calc(13px * var(--k));
    background: rgba(10, 12, 18, 0.55);
    font-size: calc(12.5px * var(--k));
    color: rgba(233, 228, 216, 0.75);
  }
  .legend b {
    color: #d8b77a;
    letter-spacing: 0.08em;
    font-size: calc(11px * var(--k));
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: calc(5px * var(--k));
  }
  .pill {
    transform: translateX(-100%);
    gap: calc(4px * var(--k));
    height: calc(22px * var(--k));
    padding: 0 calc(8px * var(--k)) 0 calc(6px * var(--k));
    border-radius: calc(11px * var(--k));
    background: rgba(10, 12, 18, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: calc(13.5px * var(--k));
    font-variant-numeric: tabular-nums;
  }
  .pill.mr {
    border-color: rgba(143, 200, 255, 0.45);
  }
  .pill.plat {
    border-color: rgba(240, 185, 85, 0.45);
  }
  .pill.ducats {
    border-color: rgba(111, 216, 138, 0.35);
  }
  .pill img,
  .sum img {
    width: calc(13px * var(--k));
    height: calc(13px * var(--k));
    object-fit: contain;
  }
  .dot {
    display: inline-block;
    width: calc(7px * var(--k));
    height: calc(7px * var(--k));
    border-radius: 50%;
    background: rgba(233, 228, 216, 0.35);
  }
  .dot.ducats {
    background: var(--green);
  }
  .dot.plat {
    background: var(--amber);
  }
  .dot.mr {
    background: var(--blue);
  }
  b.mr {
    color: var(--blue);
    font-size: calc(11.5px * var(--k));
    letter-spacing: 0.04em;
  }
  .sep {
    width: 1px;
    height: calc(11px * var(--k));
    background: rgba(233, 228, 216, 0.2);
    margin: 0 calc(2px * var(--k));
  }
  b.small {
    font-size: calc(10px * var(--k));
    opacity: 0.85;
  }
  .dim {
    color: rgba(233, 228, 216, 0.5);
    font-size: calc(11.5px * var(--k));
  }
  .sum {
    gap: calc(10px * var(--k));
    height: calc(26px * var(--k));
    padding: 0 calc(8px * var(--k));
    border-radius: calc(13px * var(--k));
    background: rgba(10, 12, 18, 0.6);
    font-size: calc(13.5px * var(--k));
  }
  .sum span {
    display: flex;
    align-items: center;
    gap: calc(4px * var(--k));
  }
  .warn {
    color: var(--blue);
  }
</style>
