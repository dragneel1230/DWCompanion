<script lang="ts">
  // Collection tab: mastery progress from the public profile (src/lib/collection/Collection.svelte).
  import { goto } from "$app/navigation";
  import Collection from "$lib/collection/Collection.svelte";

  const ROUTE = { set: "set", frame: "frame", item: "item", relic: "relic" } as const;
  const open = (kind: keyof typeof ROUTE, id: string) => goto(`/${ROUTE[kind]}?id=${encodeURIComponent(id)}`);
</script>

<div class="page wide">
  <Collection onopen={open} />
</div>

<style>
  .wide {
    max-width: 1240px;
  }
</style>
