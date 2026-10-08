<script lang="ts">
  // "How to get it" in short, from the same plan as the guide (plan.ts): the blueprint and every part with
  // where it comes from, the totals, and a button into the guide. Used by the Collection card (app and hub).
  import { num, t } from "$lib/i18n/index.svelte";
  import { iconUrl, RARITY_RU } from "$lib/db";
  import type { DropsDb } from "$lib/drops";
  import { buildTime, type CraftDb } from "$lib/craft";
  import { makePlan } from "./plan";
  import { goals, progress, type Facts } from "./goals.svelte";

  let {
    id,
    drops,
    craft,
    facts,
    ongoal,
    steps: showSteps = true,
  }: { id: string; drops: DropsDb; craft: CraftDb; facts: Facts; ongoal: (id: string) => void; steps?: boolean } = $props();

  const plan = $derived(makePlan(craft, drops, id));
  const steps = $derived(plan?.sections.find((s) => s.id === "bp")?.steps ?? []);
  const goal = $derived(goals.get(id));
  const prog = $derived(goal && plan ? progress(goal, plan, facts) : null);
  const totals = $derived(
    plan
      ? [plan.credits ? `${num(plan.credits)} ${t("goal.stat.credits")}` : "", plan.time ? `${buildTime(plan.time)} ${t("goal.stat.foundry")}` : ""]
          .filter(Boolean)
          .join(" · ")
      : "",
  );
  const short = (name: string) => (plan && name.startsWith(plan.item.name + ": ") ? name.slice(plan.item.name.length + 2) : name);
</script>

{#if plan}
  <div class="how">
    <div class="how-head">
      <span class="title">{t("coll.howToGet")}</span>
      <span class="totals">{totals}</span>
    </div>
    <div class="steps">
      {#each showSteps ? steps : [] as s (s.key)}
        {@const live = (s.relics ?? []).filter((r) => !r.vaulted)}
        <div class="step">
          <span class="ic">{#if s.icon}<img src={iconUrl(s.icon)} alt="" loading="lazy" />{/if}</span>
          <span class="txt">
            <b>{s.main ? t("coll.howMain") : short(s.name)}{#if s.count > 1}<i> ×{s.count}</i>{/if}</b>
            {#if s.kind === "relic"}
              <small>
                {#if live.length}{live.slice(0, 3).map((r) => `${r.s} (${RARITY_RU[r.rarity].toLowerCase()})`).join(", ")}{live.length > 3 ? ` ${t("coll.andMore", { v: live.length - 3 })}` : ""}
                {:else}{t("goal.hint.vaulted")}{/if}
              </small>
            {:else if s.how[0]}
              <small>{s.how[0].text}{s.how[0].sub ? ` · ${s.how[0].sub}` : ""}</small>
            {:else}
              <small class="unknown">{t("goal.hint.noSource")}</small>
            {/if}
          </span>
        </div>
      {/each}
    </div>
    <div class="act">
      {#if goal && prog}
        <span class="prog"><i style:width="{(prog.done / Math.max(1, prog.total)) * 100}%"></i></span>
        <span class="muted">{t("goal.list.next", { done: prog.done, total: prog.total })}</span>
        <button class="btn" onclick={() => ongoal(id)}>{t("goal.inGoals")} →</button>
      {:else}
        <span class="muted">{t("goal.addHint")}</span>
        <button class="btn gold" onclick={() => ongoal(id)}>＋ {t("goal.add")}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .how {
    margin-top: 16px;
    padding: 14px 14px 12px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface);
    border: 1px solid rgba(201, 166, 107, 0.22);
  }
  .how-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .totals {
    font-size: 12px;
    color: var(--text-faint);
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 4px;
  }
  .ic {
    flex: none;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
  }
  .ic img {
    max-width: 32px;
    max-height: 32px;
    object-fit: contain;
  }
  .txt {
    min-width: 0;
  }
  .txt b {
    display: block;
    font-weight: 500;
    font-size: 13.5px;
  }
  .txt b i {
    font-style: normal;
    color: var(--text-dim);
  }
  .txt small {
    display: block;
    font-size: 12px;
    color: var(--text-dim);
  }
  .txt small.unknown {
    color: var(--warn);
    opacity: 0.8;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 12px;
  }
  .act .muted {
    flex: 1;
  }
  .prog {
    flex: none;
    width: 70px;
    height: 4px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .prog i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .btn {
    flex: none;
    padding: 7px 13px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 13px;
  }
  .btn.gold {
    background: var(--accent);
    color: #16120a;
    font-weight: 600;
  }
</style>
