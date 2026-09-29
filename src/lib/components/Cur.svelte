<script lang="ts">
  // Amount with the in-game currency icon (platinum or ducats).
  let { kind, value, size = 15 }: { kind: "plat" | "ducats"; value: number | string; size?: number } = $props();

  const ICON = { plat: "/icons/platinum.png", ducats: "/icons/ducats.png" };
  const TITLE = { plat: "платина", ducats: "дукаты" };
</script>

<span class="cur {kind}" title={TITLE[kind]}>
  {value}<img src={ICON[kind]} alt={TITLE[kind]} style:width="{size}px" style:height="{size}px" />
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
