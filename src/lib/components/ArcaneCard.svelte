<script lang="ts">
  // Arcane on its rarity arch (static/modframe/ArcaneBackground*.png, from the WARFRAME wiki
  // "Media Policy/Arcane Images"), on the 512×512 canvas. The wiki recipe (343px icon, up 60px)
  // is for its padded icons; DE CDN icons are tight, so they sit smaller inside the dark well
  // (well center ≈ 256,200). Only the arch's rows (≈40–345) are shown.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import type { Arcane } from "$lib/frames";

  let {
    arcane,
    owned = false,
    scale = 0.34,
    bare = false,
    onclick,
  }: { arcane: Arcane; owned?: boolean; scale?: number; bare?: boolean; onclick?: () => void } = $props();
  const CROP_TOP = 40;
  const CROP_H = 306;

  const BG: Record<string, string> = { Common: "Common", Uncommon: "Uncommon", Rare: "Rare", Legendary: "Legendary" };
  const bg = $derived(BG[arcane.rarity] ?? "Rare");
</script>

<svelte:element
  this={bare ? "div" : "button"}
  class="arcane"
  role={bare ? undefined : "button"}
  {onclick}
  title={bare ? undefined : arcane.stats}
  style:--s={scale}
  style:--crop-top="{CROP_TOP}px"
  style:--crop-h="{CROP_H}px"
>
  <div class="view">
    <div class="native">
      <img class="bg" src="/modframe/ArcaneBackground{bg}.png" alt="" />
      <img class="icon" src={iconUrl(arcane.icon)} alt="" loading="lazy" />
    </div>
    {#if owned}<div class="own" title={t("card.owned")}>✓</div>{/if}
  </div>
  {#if !bare}<div class="name">{arcane.name}</div>{/if}
</svelte:element>

<style>
  .arcane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: calc(512px * var(--s));
    transition: transform 0.12s, filter 0.12s;
  }
  button.arcane:hover {
    transform: translateY(-2px);
    filter: brightness(1.1);
  }
  .view {
    position: relative;
    width: calc(512px * var(--s));
    height: calc(var(--crop-h) * var(--s));
    overflow: hidden;
  }
  /* 512×512 canvas in native pixels, shifted up so only the arch shows. */
  .native {
    position: absolute;
    left: 0;
    top: calc(var(--crop-top) * var(--s) * -1);
    width: 512px;
    height: 512px;
    transform: scale(var(--s));
    transform-origin: top left;
  }
  .bg {
    position: absolute;
    inset: 0;
    width: 512px;
    height: 512px;
  }
  .icon {
    position: absolute;
    left: 161px;
    top: 105px;
    width: 190px;
    height: 190px;
    object-fit: contain;
    filter: drop-shadow(0 0 10px rgba(0, 229, 255, 0.45));
  }
  .own {
    position: absolute;
    right: 10px;
    bottom: 6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 10px;
    color: #0e1014;
    background: var(--good);
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    color: #e6e8ee;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }
</style>
