<script lang="ts">
  // «Добыча» in the app window (src/lib/views/FarmView, also a hub tab). The opened entry lives in the URL:
  // ?id=<resource>, ?craft=<item or component>, ?prime=<prime part> (links from search, hub, relics).
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { missionState } from "$lib/missionState.svelte";
  import FarmView from "$lib/views/FarmView.svelte";
  import type { FarmSel } from "$lib/views/farmState.svelte";

  missionState.start();

  const sel = $derived.by((): FarmSel | null => {
    const p = page.url.searchParams;
    if (p.get("id")) return { kind: "resource", id: p.get("id")! };
    if (p.get("craft")) return { kind: "craft", id: p.get("craft")! };
    if (p.get("prime")) return { kind: "prime", id: p.get("prime")! };
    return null;
  });
  const PARAM = { resource: "id", craft: "craft", prime: "prime" } as const;
  const select = (s: FarmSel) => goto(`/resources?${PARAM[s.kind]}=${encodeURIComponent(s.id)}`, { keepFocus: true, noScroll: true });
</script>

<div class="page wide">
  <FarmView mission={missionState.value} {sel} onselect={select} />
</div>

<style>
  .wide {
    max-width: 1400px;
    height: 100vh;
    padding-bottom: 24px;
    display: flex;
    flex-direction: column;
  }
  .wide > :global(.farm) {
    flex: 1;
  }
</style>
