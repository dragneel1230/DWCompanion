<script lang="ts">
  // Arcane in a golden arch, like the game's arcane slot.
  import { iconUrl } from "$lib/db";
  import type { Arcane } from "$lib/frames";

  let { arcane, owned = false, onclick }: { arcane: Arcane; owned?: boolean; onclick?: () => void } = $props();
</script>

<button class="arcane" {onclick} title={arcane.stats}>
  <div class="arch">
    <div class="well"><img src={iconUrl(arcane.icon)} alt="" loading="lazy" /></div>
    {#if owned}<div class="own" title="Есть у меня">✓</div>{/if}
  </div>
  <div class="name">{arcane.ru}</div>
</button>

<style>
  .arcane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 150px;
    transition: transform 0.12s;
  }
  .arcane:hover {
    transform: translateY(-2px);
  }
  .arch {
    position: relative;
    width: 120px;
    height: 68px;
    display: grid;
    place-items: end center;
    padding-bottom: 6px;
    border-radius: 60px 60px 6px 6px;
    background: linear-gradient(180deg, #f3d98f, #b98a2e 55%, #6d4c14);
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45), 0 4px 10px rgba(0, 0, 0, 0.5);
  }
  .well {
    width: 76px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 38px 38px 4px 4px;
    background: radial-gradient(circle at 50% 60%, #0f2a33, #070b10 75%);
    box-shadow: inset 0 0 0 2px rgba(40, 24, 4, 0.8);
  }
  .well img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.55));
  }
  .own {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 9px;
    color: #0e1014;
    background: var(--good);
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    color: #e6e8ee;
  }
</style>
