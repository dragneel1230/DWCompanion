<script lang="ts">
  // Collapsed mod card built from the game's own frame parts (static/modframe, taken from the
  // WARFRAME wiki "Mod/Assets", originally from DE's companion app / Arsenal Twitch extension).
  // Laid out in the assets' native pixels (292 × 150) and scaled down as a whole.
  // Above the card: the slot's forma polarity, green when it matches (drain halved, aura doubled).
  import { t } from "$lib/i18n/index.svelte";
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
    rank = undefined,
    polRow = true,
    onclick,
    onhover,
  }: {
    mod?: Mod | null;
    slotPol?: Polarity | null;
    label?: "aura" | "exilus" | "stance" | ""; // special slot: its frame and caption
    owned?: boolean;
    scale?: number;
    bare?: boolean; // thumbnail: no slot polarity row, not clickable
    rank?: number; // default: max rank
    polRow?: boolean; // false when the parent draws its own slot polarity control
    onclick?: () => void;
    onhover?: (el: HTMLElement | null) => void;
  } = $props();

  const FRAME: Record<string, string> = {
    Common: "Bronze",
    Uncommon: "Silver",
    Rare: "Gold",
    Legendary: "Legendary",
    Peculiar: "Legendary",
  };
  const frame = $derived(mod ? (mod.fr ?? (mod.pol === "umbra" ? "Legendary" : (FRAME[mod.rarity] ?? "Bronze"))) : "Bronze");
  const r = $derived(mod ? Math.min(rank ?? mod.max, mod.max) : 0);
  const cost = $derived(mod ? modCost(mod, slotPol, r) : 0);
  const match = $derived(!!mod && !!slotPol && (slotPol === mod.pol || slotPol === "any"));
  const mismatch = $derived(!!mod && !!slotPol && !match && !mod.aura && !mod.stance);
  const ranks = $derived(Math.min(mod?.max ?? 0, 10));
  const active = $derived(Math.min(r, 10));
  const kindIcon = $derived(label === "aura" ? "/modframe/SilverAura.png" : label === "exilus" ? "/modframe/GoldExilus.png" : null);
</script>

<div class="slot" style:--s={scale}>
  {#if !bare && polRow}
    <div class="slot-pol" class:match>
      {#if slotPol}<PolIcon pol={slotPol} size={13} />{/if}
    </div>
  {/if}

  {#if mod}
    <svelte:element
      this={bare ? "div" : "button"}
      class="card"
      {onclick}
      role={bare ? undefined : "button"}
      onmouseenter={(e: MouseEvent) => onhover?.(e.currentTarget as HTMLElement)}
      onmouseleave={() => onhover?.(null)}
    >
      <div class="native">
        <div class="bg" style:background-image="url(/modframe/{frame}Background.png)"></div>
        <div class="art" style:background-image="url({iconUrl(mod.icon)})"></div>
        <div class="shade"></div>
        <img class="top" src="/modframe/{frame}FrameTop.png" alt="" />
        <img class="bottom" src="/modframe/{frame}FrameBottom.png" alt="" />
        {#if kindIcon}<img class="kind" src={kindIcon} alt={label} title={label} />{/if}
        <div class="tab" class:match class:mismatch style:background-image="url(/modframe/{frame}TopRightBacker.png)">
          <span>{mod.aura || mod.stance ? `+${-cost}` : cost}</span>
          <PolIcon pol={mod.pol} size={17} />
        </div>
        <div class="name">{mod.name}</div>
        <div class="stars">
          {#each { length: ranks } as _, i}<img class:off={i >= active} src="/modframe/RankSlotActive.png" alt="" />{/each}
        </div>
        <img class="line" src="/modframe/RankCompleteLine.png" alt="" />
        {#if owned}<div class="own" title={t("card.owned")}>✓</div>{/if}
      </div>
    </svelte:element>
  {:else}
    <svelte:element this={onclick && !bare ? "button" : "div"} class="card empty" class:add={!!onclick} {onclick} role={onclick ? "button" : undefined}>
      <span>{#if onclick}<b>+</b>{/if}{label === "aura" ? t("bb.aura") : label === "exilus" ? t("bb.exilus") : label === "stance" ? t("gb.stance") : onclick ? t("kind.mod") : t("card.empty")}</span>
    </svelte:element>
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
  .stars img.off {
    opacity: 0.22;
    filter: grayscale(1);
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

  .empty.add:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .empty b {
    font-weight: 400;
    margin-right: 4px;
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
