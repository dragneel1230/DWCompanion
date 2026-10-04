<script lang="ts">
  // Expanded mod card, like hovering a mod in the game: art, name, stats at the current rank,
  // set progress and the type tab. Built from the same wiki frame parts as ModCard.
  import { t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import { modCost, type FramesDb, type Mod } from "$lib/frames";
  import PolIcon from "./PolIcon.svelte";

  let { db, mod, rank, setCount = 0, scale = 0.8 }: { db: FramesDb; mod: Mod; rank: number; setCount?: number; scale?: number } = $props();

  const FRAME: Record<string, string> = { Common: "Bronze", Uncommon: "Silver", Rare: "Gold", Legendary: "Legendary", Peculiar: "Legendary" };
  const frame = $derived(mod.pol === "umbra" ? "Legendary" : (FRAME[mod.rarity] ?? "Bronze"));
  const set = $derived(mod.set ? db.sets[mod.set] : null);
  const text = $derived(mod.levels[rank] ?? mod.stats);
  const bonus = $derived(set ? (set.values[setCount - 2] ?? 0) : 0);
  const kind = $derived(`${set ? t("tip.setPrefix") : ""}${mod.aura ? t("bb.aura") : mod.augment ? t("tip.augment") : t("kind.frame")}`);
</script>

<div class="tip" style:zoom={scale}>
  <div class="bg" style:background-image="url(/modframe/{frame}Background.png)"></div>
  <div class="art" style:background-image="url({iconUrl(mod.icon)})"></div>
  <img class="top" src="/modframe/{frame}FrameTop.png" alt="" />
  <img class="side l" src="/modframe/{frame}SideLight.png" alt="" />
  <img class="side r" src="/modframe/{frame}SideLight.png" alt="" />
  <div class="tab" style:background-image="url(/modframe/{frame}TopRightBacker.png)">
    <span>{mod.aura ? `+${-modCost(mod, null, rank)}` : modCost(mod, null, rank)}</span>
    <PolIcon pol={mod.pol} size={17} />
  </div>

  <div class="body">
    <div class="name">{mod.name}</div>
    <div class="stats">{text}</div>
    {#if set}
      <div class="set">
        {#each { length: set.n } as _, i}<i class:on={i < setCount}></i>{/each}
      </div>
      {#if set.desc}<div class="stats">{set.desc}</div>{/if}
      {#if bonus > 0}<div class="stats bonus">{t("tip.setBonus", { v: Math.round(bonus * 100) })}</div>{/if}
    {/if}
  </div>

  <div class="stars">
    {#each { length: Math.min(mod.max, 10) } as _, i}<img class:off={i >= rank} src="/modframe/RankSlotActive.png" alt="" />{/each}
  </div>
  <img class="bottom" src="/modframe/{frame}FrameBottom.png" alt="" />
  <div class="lower" style:background-image="url(/modframe/{frame}LowerTab.png)">{kind}</div>
</div>

<style>
  /* Native pixels of the frame parts; the whole card is zoomed. */
  .tip {
    position: relative;
    width: 292px;
    min-height: 400px;
    display: flex;
    flex-direction: column;
    color: #eef1f7;
    pointer-events: none;
  }
  .bg,
  .art {
    position: absolute;
    left: 25px;
    right: 25px;
    top: 12px;
  }
  .bg {
    bottom: 40px;
    background-size: cover;
    background-position: center;
    border-radius: 4px;
  }
  .bg::after {
    content: "";
    position: absolute;
    inset: 150px 0 0;
    background: linear-gradient(180deg, rgba(10, 12, 18, 0), rgba(10, 12, 18, 0.88) 60px);
  }
  .art {
    height: 190px;
    background-size: cover;
    background-position: center 30%;
    -webkit-mask: linear-gradient(180deg, #000 60%, transparent);
    mask: linear-gradient(180deg, #000 60%, transparent);
  }
  .top {
    position: absolute;
    left: 6px;
    top: 0;
  }
  .side {
    position: absolute;
    top: 70px;
    height: 200px;
    width: 16px;
  }
  .side.l {
    left: 12px;
  }
  .side.r {
    right: 12px;
    transform: scaleX(-1);
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
    font-size: 21px;
    text-shadow: 0 1px 2px #000;
  }
  .body {
    position: relative;
    padding: 176px 38px 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
  }
  .name {
    font-size: 23px;
    line-height: 1.1;
  }
  .stats {
    font-size: 17px;
    line-height: 1.3;
    white-space: pre-line;
    color: #dfe3ec;
  }
  .bonus {
    color: #7fe39a;
  }
  .set {
    display: flex;
    gap: 6px;
  }
  .set i {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #dfe3ec;
  }
  .set i.on {
    background: #dfe3ec;
  }
  .stars {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 66px;
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
  .bottom {
    position: absolute;
    left: 0;
    bottom: 0;
  }
  .lower {
    position: absolute;
    left: 41px;
    bottom: 14px;
    width: 210px;
    height: 26px;
    display: grid;
    place-items: center;
    background-size: 100% 100%;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
