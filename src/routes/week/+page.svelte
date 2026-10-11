<script lang="ts">
  // «Неделя» in the app window (src/lib/views/WeekView, also a hub tab).
  import WeekView from "$lib/views/WeekView.svelte";
</script>

<div class="page wide">
  <WeekView />
</div>

<style>
  .wide {
    max-width: 1280px;
  }
</style>
