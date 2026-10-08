<script lang="ts">
  // «Торговля» in the app window (src/lib/views/TradeView, also a hub tab). ?tab=<sub> picks a sub-tab,
  // ?new=<slug>&type=sell|buy opens a new order on the desk.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { appPath, type View } from "$lib/hub/hub";
  import { followSection } from "$lib/views/sub.svelte";
  import TradeView from "$lib/views/TradeView.svelte";

  $effect(() => {
    if (page.url.search) {
      followSection(page.url.pathname + page.url.search);
      goto("/trade", { replaceState: true, keepFocus: true, noScroll: true });
    }
  });
  const open = (v: View) => goto(appPath(v));
</script>

<div class="page wide">
  <TradeView onopen={open} />
</div>

<style>
  .wide {
    max-width: 1180px;
  }
</style>
