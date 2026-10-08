<script lang="ts">
  // «Билды» in the app window (src/lib/views/BuildsView, also a hub tab). ?id=<frame>&build= / ?gear=<item>&kind=&build= picks one.
  import { page } from "$app/state";
  import BuildsView from "$lib/views/BuildsView.svelte";
  import { followBuilds } from "$lib/views/sub.svelte";

  $effect(() => followBuilds(page.url.searchParams));
</script>

<div class="page wide">
  <BuildsView />
</div>

<style>
  .wide {
    max-width: 1400px;
  }
</style>
