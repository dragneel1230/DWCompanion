<script lang="ts">
  // Mod card in the build grid, styled after the in-game card: art, drain + polarity, name, rank pips.
  import { iconUrl } from "$lib/db";
  import { modCost, type Mod, type Arcane, type Polarity } from "$lib/frames";

  let {
    mod = null,
    arcane = null,
    label = "",
    owned = false,
    onclick,
  }: {
    mod?: Mod | null;
    arcane?: Arcane | null;
    label?: string;
    owned?: boolean;
    onclick?: () => void;
  } = $props();

  const item = $derived(mod ?? arcane);
  const pol = $derived<Polarity | null>(mod?.pol ?? null);
  const umbra = $derived(mod?.pol === "umbra");
  const rarity = $derived(umbra ? "Umbra" : (item?.rarity ?? "Common"));
  const cost = $derived(mod ? modCost(mod) : null);
</script>

{#if item}
  <button class="card r-{rarity}" class:arcane={!!arcane} {onclick} title={item.stats}>
    <div class="art">
      <img src={iconUrl(item.icon)} alt="" loading="lazy" />
    </div>
    {#if mod}
      <div class="drain">
        {mod.aura ? `+${Math.abs(cost ?? 0)}` : cost}
        {#if pol}<img src="/icons/{pol}.png" alt="" />{/if}
      </div>
    {/if}
    <div class="name">{item.ru}</div>
    <div class="pips">
      {#each { length: Math.min(item.max, 10) } as _}<i></i>{/each}
    </div>
    {#if label}<div class="label">{label}</div>{/if}
    {#if owned}<div class="own" title="Есть у меня">✓</div>{/if}
  </button>
{:else}
  <div class="card empty">
    <span>{label || "Пусто"}</span>
  </div>
{/if}

<style>
  .card {
    --edge: var(--common);
    position: relative;
    width: 118px;
    height: 168px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 0 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, #1b1f28, #12151b);
    border: 1px solid color-mix(in srgb, var(--edge) 55%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
    overflow: hidden;
    transition: transform 0.12s, border-color 0.12s;
  }
  button.card:hover {
    transform: translateY(-2px);
    border-color: var(--edge);
  }
  .r-Common {
    --edge: var(--common);
  }
  .r-Uncommon {
    --edge: var(--uncommon);
  }
  .r-Rare {
    --edge: var(--rare);
  }
  .r-Legendary {
    --edge: #e9ecf7;
  }
  .r-Umbra {
    --edge: #b99cff;
  }
  .art {
    width: 100%;
    height: 92px;
    display: grid;
    place-items: center;
    background: radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--edge) 16%, transparent), transparent 70%);
  }
  .art img {
    max-width: 100%;
    max-height: 92px;
    object-fit: cover;
  }
  .arcane .art img {
    max-width: 72px;
    max-height: 72px;
  }
  .drain {
    position: absolute;
    top: 6px;
    right: 7px;
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 6px;
    background: rgba(8, 9, 12, 0.72);
  }
  .drain img {
    width: 12px;
    height: 12px;
  }
  .name {
    flex: 1;
    display: flex;
    align-items: center;
    text-align: center;
    padding: 4px 8px 0;
    font-size: 12px;
    line-height: 1.25;
    color: var(--text);
  }
  .pips {
    display: flex;
    gap: 3px;
  }
  .pips i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--edge);
    opacity: 0.85;
  }
  .label {
    position: absolute;
    top: 6px;
    left: 7px;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    background: rgba(8, 9, 12, 0.72);
    padding: 1px 5px;
    border-radius: 6px;
  }
  .own {
    position: absolute;
    top: 72px;
    left: 7px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 10px;
    color: #0e1014;
    background: var(--good);
  }
  .empty {
    border: 1px dashed var(--line);
    background: none;
    justify-content: center;
    color: var(--text-faint);
    font-size: 12px;
  }
</style>
