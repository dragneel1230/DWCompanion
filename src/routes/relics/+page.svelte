<script lang="ts">
  // «Реликвии» in the app window (src/lib/views/RelicsView, also a hub tab). ?tab=<sub> picks a sub-tab.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { followSection } from "$lib/views/sub.svelte";
  import RelicsView from "$lib/views/RelicsView.svelte";

  $effect(() => {
    if (page.url.search) {
      followSection(page.url.pathname + page.url.search);
      goto("/relics", { replaceState: true, keepFocus: true, noScroll: true });
    }
  });
</script>

<div class="page wide">
  <RelicsView />
</div>

<style>
  .wide {
    max-width: 1180px;
  }
</style>
