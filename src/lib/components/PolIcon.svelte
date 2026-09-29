<script lang="ts">
  // Polarity glyph tinted with the current text color (the game icons are single-color PNGs).
  import type { Polarity } from "$lib/frames";

  let { pol, size = 14, color = "currentColor" }: { pol: Polarity | "aura"; size?: number; color?: string } = $props();
</script>

<i
  class="pol"
  style:width="{size}px"
  style:height="{size}px"
  style:background={color}
  style:--src="url(/icons/{pol}.png)"
></i>

<style>
  .pol {
    display: inline-block;
    flex: none;
    -webkit-mask: var(--src) center / contain no-repeat;
    mask: var(--src) center / contain no-repeat;
  }
</style>
