<script lang="ts">
  // «Билды» in the app window (src/lib/views/BuildsView, also a hub tab). ?id=<frame>&build= / ?gear=<item>&kind=&build= picks one.
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import BuildsView from "$lib/views/BuildsView.svelte";
  import { followBuilds } from "$lib/views/sub.svelte";

  // Only the URL is the trigger: picking reads the selection it writes (pickGear), which would loop.
  $effect(() => {
    const q = page.url.searchParams;
    untrack(() => followBuilds(q));
  });
</script>

<div class="page wide">
  <BuildsView />
</div>

<style>
  .wide {
    max-width: 1400px;
  }
</style>
