<script lang="ts">
  // «Сейчас» (app page and hub tab): where I am (mission / lobby from EE.log with the squad's relics),
  // open fissures with how many relics of each tier I hold, the world's timers and this week's activities. Every timer and
  // Baro's goods open over it ("time" / "baro" views).
  import type { Priority } from "$lib/overlaySettings.svelte";
  import type { Mission, View } from "$lib/hub/hub";
  import MissionPanel from "$lib/hub/Mission.svelte";
  import Fissures from "$lib/hub/Fissures.svelte";
  import World from "$lib/hub/World.svelte";
  import Weekly from "$lib/hub/Weekly.svelte";

  let {
    mission,
    game,
    priority,
    now,
    onopen,
  }: { mission: Mission | null; game: boolean; priority: Priority; now: number; onopen: (v: View) => void } = $props();
</script>

<div class="now">
  <div class="cell" style:--d="0ms"><MissionPanel {mission} {game} {priority} {onopen} /></div>
  <div class="cell" style:--d="30ms"><Fissures {now} /></div>
  <div class="cell side" style:--d="60ms">
    <World {now} {onopen} />
    <Weekly {now} />
  </div>
</div>

<style>
  .now {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 0.8fr);
    gap: 16px;
  }
  @media (max-width: 1100px) {
    .now {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  .cell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    animation: rise 0.18s var(--d) cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .cell > :global(.panel) {
    flex: 1;
  }
  /* World and the week share the column; each scrolls inside. */
  .side {
    gap: 16px;
  }
  .side > :global(.panel) {
    flex: 1 1 0;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }
  }
</style>
