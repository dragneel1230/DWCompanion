<script lang="ts">
  // A mod as a goal: the card in its game frame, then two steps — get it (where it drops or is sold,
  // Baro, the market) and rank it up (Endo). Marks come from the inventory or by hand (modGoal.ts).
  import { t, num } from "$lib/i18n/index.svelte";
  import type { DropsDb } from "$lib/drops";
  import { RARITY_RU, type Mod } from "$lib/frames";
  import { prices } from "$lib/prices.svelte";
  import { inventory } from "$lib/inventory.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import ModWhere from "./ModWhere.svelte";
  import { goals, type Goal, type Why } from "./goals.svelte";
  import { endoToMax, modKey, modProgress, modStepState, MOD_STEPS, type ModStep } from "./modGoal";

  let { id, mod, goal, drops, onnav }: { id: string; mod: Mod; goal: Goal; drops: DropsDb; onnav?: (href: string) => void } = $props();

  function nav(e: MouseEvent) {
    if (!onnav) return;
    e.preventDefault();
    onnav((e.currentTarget as HTMLAnchorElement).getAttribute("href") ?? "/");
  }

  const prog = $derived(modProgress(goal, id, mod));
  const share = $derived(prog.done / prog.total);
  const endo = $derived(endoToMax(mod));
  const rank = $derived(inventory.modRank(id));
  $effect(() => prices.want([mod.slug]));
  const price = $derived(mod.slug ? prices.sell[mod.slug] : undefined);

  const TITLE: Record<ModStep, () => string> = {
    get: () => t("goal.mod.get"),
    rank: () => t("goal.mod.rank", { n: mod.max }),
  };
  const WHY: Record<Why, () => string> = {
    hand: () => "",
    journal: () => t("goal.why.journal"),
    profile: () => t("goal.why.profile"),
    after: () => t("goal.why.after"),
    inventory: () => t("goal.why.inventory"),
  };
  const toggle = (s: ModStep) => goals.mark(goal.id, modKey(id, s), !modStepState(goal, id, mod, s).done);
</script>

<div class="guide">
  <section class="panel head">
    <div class="card"><ModCard {mod} scale={0.5} bare rank={rank ?? undefined} /></div>
    <div class="info">
      <h1>{mod.name}</h1>
      <div class="tags">
        <span class="tag">{t("tag.mod")} · {RARITY_RU[mod.rarity]}</span>
        {#if rank != null}<span class="tag good">{t("goal.mod.have", { n: rank })}</span>{/if}
      </div>
      <div class="stats">
        <span><b>{mod.max}</b> {t("goal.mod.maxRank")}</span>
        {#if endo}<span title={t("goal.mod.endoSrc")}><b>{num(endo)}</b> {t("goal.mod.endo")}</span>{/if}
        {#if price}<span>{t("goal.mod.buyShort")} <b class="pl"><Cur kind="plat" value={price} /></b></span>{/if}
      </div>
      {#if mod.stats}<p class="desc">{mod.stats}</p>{/if}
    </div>
    <div class="ring" title={t("goal.progress", { done: prog.done, total: prog.total })}>
      <svg viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="19" class="track" />
        <circle cx="22" cy="22" r="19" class="fill" style:stroke-dasharray="{share * 119.4} 119.4" />
      </svg>
      <span><b>{Math.round(share * 100)}%</b><small>{prog.done}/{prog.total}</small></span>
    </div>
  </section>

  {#if !prog.next}
    <section class="panel step finished">
      <h2>{t("goal.finished")}</h2>
      <p>{t("goal.mod.finishedHint")}</p>
    </section>
  {/if}

  {#each MOD_STEPS as s, i (s)}
    {@const st = modStepState(goal, id, mod, s)}
    <section class="panel step" class:now={prog.next === s} class:done={st.done}>
      <div class="step-head">
        <button class="check" onclick={() => toggle(s)} title={st.done ? t("goal.unmark") : t("goal.markDone")} aria-pressed={st.done}>
          {st.done ? "✓" : i + 1}
        </button>
        <h2>{TITLE[s]()}</h2>
        {#if st.why && st.why !== "hand"}<em>{WHY[st.why]()}</em>{/if}
        {#if prog.next === s}<span class="label">{t("goal.next")}</span>{/if}
      </div>
      <div class="body">
        {#if s === "get"}
          <ModWhere {id} en={mod.en} {drops} />
          {#if price}<p class="alt">{t("goal.mod.buy")} <b class="pl"><Cur kind="plat" value={price} /></b></p>{/if}
          <a class="more-link" href="/market?id={encodeURIComponent(id)}" onclick={nav}>{t("goal.mod.page")} →</a>
        {:else}
          <p class="say">
            {endo ? t("goal.mod.rankSay", { v: num(endo) }) : t("goal.mod.rankSayAny")}
          </p>
          {#if rank != null}<p class="alt">{t("goal.mod.rankNow", { n: rank, max: mod.max })}</p>{/if}
        {/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .guide {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .panel.head {
    flex-direction: row;
    align-items: center;
    gap: 22px;
    padding: 18px 22px;
  }
  .card {
    flex: none;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .tag.good {
    color: var(--good);
    border-color: rgba(111, 207, 151, 0.4);
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-dim);
  }
  .stats b {
    color: var(--text);
    font-weight: 600;
  }
  b.pl {
    color: var(--plat);
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .desc {
    margin: 10px 0 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--text-faint);
    white-space: pre-line;
  }
  .ring {
    position: relative;
    flex: none;
    width: 92px;
    height: 92px;
  }
  .ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 3.5;
  }
  .track {
    stroke: var(--surface-2);
  }
  .fill {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dasharray 0.3s;
    filter: drop-shadow(0 0 4px rgba(201, 166, 107, 0.45));
  }
  .ring span {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .ring b {
    font-size: 19px;
  }
  .ring small {
    font-size: 11px;
    color: var(--text-faint);
  }

  .panel.step {
    padding: 14px 20px 16px;
  }
  .panel.step.now {
    background:
      radial-gradient(120% 140% at 0% 0%, rgba(201, 166, 107, 0.13), transparent 55%),
      var(--glass);
    border-color: rgba(201, 166, 107, 0.3);
  }
  .finished h2 {
    margin: 0;
    font-size: 18px;
    color: var(--good);
  }
  .finished p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-dim);
  }
  .step-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .step-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .done .step-head h2 {
    color: var(--text-faint);
  }
  .step-head em {
    font-style: normal;
    font-size: 11.5px;
    color: var(--good);
  }
  .label {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .check {
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.22);
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
    display: grid;
    place-items: center;
    transition: background 0.12s, border-color 0.12s;
  }
  .check:hover {
    border-color: var(--accent);
  }
  .done .check {
    background: var(--good);
    border-color: var(--good);
    color: #16120a;
  }
  .now .check {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(201, 166, 107, 0.15);
  }
  .body {
    margin: 12px 0 0 40px;
  }
  .done .body {
    opacity: 0.6;
  }
  .say {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .alt {
    margin: 10px 0 0;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .more-link {
    display: inline-block;
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--accent);
  }
</style>
