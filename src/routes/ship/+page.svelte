<script lang="ts">
  // «Орбитер» in the app window (src/lib/views/ShipView, also a hub tab). ?tab=<sub> picks a sub-tab.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { followSection } from "$lib/views/sub.svelte";
  import ShipView from "$lib/views/ShipView.svelte";

  $effect(() => {
    if (page.url.search) {
      followSection(page.url.pathname + page.url.search);
      goto("/ship", { replaceState: true, keepFocus: true, noScroll: true });
    }
  });
</script>

<div class="page wide">
  <ShipView />
</div>

<style>
  .wide {
    max-width: 1180px;
  }
</style>
