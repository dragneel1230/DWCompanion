<script lang="ts">
  // Amount with the in-game currency icon (platinum or ducats).
  import { labels, num } from "$lib/i18n/index.svelte";
  let { kind, value, size = 15 }: { kind: "plat" | "ducats"; value: number | string; size?: number } = $props();

  const ICON = { plat: "/icons/platinum.png", ducats: "/icons/ducats.png" };
  const TITLE = labels({ plat: "cur.plat", ducats: "cur.ducats" });
  // Fractions come from pack prices (23 for 6 = 3.8 each); written by the UI language.
  const text = $derived(typeof value === "number" && !Number.isInteger(value) ? num(value, 1) : value);
</script>

<span class="cur {kind}" title={TITLE[kind]}>
  {text}<img src={ICON[kind]} alt={TITLE[kind]} style:width="{size}px" style:height="{size}px" />
</span>

<style>
  .cur {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .plat {
    color: var(--plat);
  }
  .ducats {
    color: var(--ducat);
  }
  img {
    object-fit: contain;
  }
</style>
