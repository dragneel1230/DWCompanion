<script lang="ts">
  // Collapsed mod card built from the game's own frame parts (static/modframe, taken from the
  // WARFRAME wiki "Mod/Assets", originally from DE's companion app / Arsenal Twitch extension).
  // Laid out in the assets' native pixels (292 × 150) and scaled down as a whole.
  // Above the card: the slot's forma polarity, green when it matches (drain halved, aura doubled).
  import { iconUrl } from "$lib/db";
  import { modCost, type Mod, type Polarity } from "$lib/frames";
  import PolIcon from "./PolIcon.svelte";

  let {
    mod = null,
    slotPol = null,
    label = "",
    owned = false,
    scale = 0.72,
    bare = false,
    onclick,
  }: {
    mod?: Mod | null;
    slotPol?: Polarity | null;
    label?: "Аура" | "Эксилус" | "";
    owned?: boolean;
    scale?: number;
    bare?: boolean; // thumbnail: no slot polarity row, not clickable
    onclick?: () => void;
  } = $props();

  const FRAME: Record<string, string> = {
    Common: "Bronze",
    Uncommon: "Silver",
    Rare: "Gold",
    Legendary: "Legendary",
    Peculiar: "Legendary",
  };
  const frame = $derived(mod ? (mod.pol === "umbra" ? "Legendary" : (FRAME[mod.rarity] ?? "Bronze")) : "Bronze");
  const cost = $derived(mod ? modCost(mod, slotPol) : 0);
  const match = $derived(!!mod && !!slotPol && (slotPol === mod.pol || slotPol === "any"));
  const mismatch = $derived(!!mod && !!slotPol && !match && !mod.aura);
  const ranks = $derived(Math.min(mod?.max ?? 0, 10));
  const kindIcon = $derived(label === "Аура" ? "/modframe/SilverAura.png" : label === "Эксилус" ? "/modframe/GoldExilus.png" : null);
</script>

<div class="slot" style:--s={scale}>
  {#if !bare}
    <div class="slot-pol" class:match>
      {#if slotPol}<PolIcon pol={slotPol} size={13} />{/if}
    </div>
  {/if}

  {#if mod}
    <svelte:element this={bare ? "div" : "button"} class="card" {onclick} title={bare ? undefined : mod.stats} role={bare ? undefined : "button"}>
      <div class="native">
        <div class="bg" style:background-image="url(/modframe/{frame}Background.png)"></div>
        <div class="art" style:background-image="url({iconUrl(mod.icon)})"></div>
        <div class="shade"></div>
        <img class="top" src="/modframe/{frame}FrameTop.png" alt="" />
        <img class="bottom" src="/modframe/{frame}FrameBottom.png" alt="" />
        {#if kindIcon}<img class="kind" src={kindIcon} alt={label} title={label} />{/if}
        <div class="tab" class:match class:mismatch style:background-image="url(/modframe/{frame}TopRightBacker.png)">
          <span>{mod.aura ? `+${-cost}` : cost}</span>
          <PolIcon pol={mod.pol} size={17} />
        </div>
        <div class="name">{mod.ru}</div>
        <div class="stars">
          {#each { length: ranks } as _}<img src="/modframe/RankSlotActive.png" alt="" />{/each}
        </div>
        <img class="line" src="/modframe/RankCompleteLine.png" alt="" />
        {#if owned}<div class="own" title="Есть у меня">✓</div>{/if}
      </div>
    </svelte:element>
  {:else}
    <div class="card empty"><span>{label || "Пусто"}</span></div>
  {/if}
</div>

<style>
  .slot {
    width: calc(292px * var(--s));
    display: flex;
    flex-direction: column;
  }
  .slot-pol {
    height: 16px;
    display: flex;
    justify-content: flex-end;
    padding-right: calc(30px * var(--s));
    color: var(--text-faint);
  }
  .slot-pol.match {
    color: #5fe07a;
  }

  .card {
    position: relative;
    width: calc(292px * var(--s));
    height: calc(150px * var(--s));
    padding: 0;
    transition: transform 0.12s, filter 0.12s;
  }
  .slot :global(button.card:hover) {
    transform: translateY(-2px);
    filter: brightness(1.12);
  }

  /* Everything below is in the frame assets' native pixels. */
  .native {
    position: absolute;
    top: 0;
    left: 0;
    width: 292px;
    height: 150px;
    transform: scale(var(--s));
    transform-origin: top left;
  }
  .bg,
  .art,
  .shade {
    position: absolute;
    left: 24px;
    right: 24px;
    top: 12px;
    bottom: 22px;
  }
  .bg {
    background-size: cover;
    background-position: center;
  }
  /* Mod art over the rarity background, slightly see-through like the in-game collapsed card. */
  .art {
    background-size: cover;
    background-position: center 35%;
    opacity: 0.6;
  }
  .shade {
    background: linear-gradient(180deg, rgba(8, 10, 16, 0.05), rgba(8, 10, 16, 0.45) 75%);
  }
  .top {
    position: absolute;
    left: 6px;
    top: 0;
  }
  .bottom {
    position: absolute;
    left: 0;
    top: 30px;
  }
  .kind {
    position: absolute;
    left: 50%;
    top: 22px;
    height: 24px;
    transform: translateX(-50%);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.9));
  }
  .tab {
    position: absolute;
    right: 24px;
    top: 14px;
    min-width: 62px;
    height: 30px;
    padding: 0 8px 0 16px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    background-size: 100% 100%;
    color: #f2f4f8;
    font-size: 21px;
    text-shadow: 0 1px 2px #000;
  }
  .tab.match {
    color: #5fe07a;
  }
  .tab.mismatch {
    color: #ff7b6b;
  }
  .name {
    position: absolute;
    left: 30px;
    right: 30px;
    top: 44px;
    height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 23px;
    line-height: 1.05;
    color: #eef1f7;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95);
  }
  .stars {
    position: absolute;
    left: 0;
    right: 0;
    top: 118px;
    display: flex;
    justify-content: center;
    gap: 2px;
  }
  .stars img {
    width: 13px;
    height: 13px;
  }
  .line {
    position: absolute;
    left: 18px;
    top: 131px;
    width: 256px;
    opacity: 0.8;
  }
  .own {
    position: absolute;
    left: 34px;
    top: 112px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 13px;
    color: #0e1014;
    background: var(--good);
  }

  .empty {
    display: grid;
    place-items: center;
    border: 1px dashed var(--line);
    border-radius: 10px;
    color: var(--text-faint);
    font-size: 12px;
  }
</style>
