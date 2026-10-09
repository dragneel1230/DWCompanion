<script lang="ts">
  // An ability's numbers at max rank with the build's Strength / Duration / Range / Efficiency applied,
  // laid out like the game's ability tooltip. Each row carries the stat it scales with (colored mark),
  // values that grew are green, ones that shrank red. Numbers: wiki infobox (DE publishes only the cost).
  import { num, t } from "$lib/i18n/index.svelte";
  import { abilityCost, type Ability, type AbilityStat } from "$lib/frames";

  type Mods = { str: number; dur: number; rng: number; eff: number };
  let { ability, mods, compact = false }: { ability: Ability; mods: Mods; compact?: boolean } = $props();

  type Kind = "str" | "dur" | "rng" | "misc";
  const KIND_LABEL: Record<Kind, () => string> = {
    str: () => t("ab.str"),
    dur: () => t("ab.dur"),
    rng: () => t("ab.rng"),
    misc: () => "",
  };
  const st = $derived(ability.stats);

  const RANGE = /\d\s*[-–]\s*\d/;
  // "350 - 700", "8 - 20m": a range from the wiki, both ends follow the build.
  function range(v: string, mul: number): string {
    const m = v.match(/^([\d.,]+)\s*[-–]\s*([\d.,]+)\s*(.*)$/);
    if (!m) return v;
    const f = (x: string) => num(+(Number(x.replace(/,/g, "")) * mul).toFixed(1));
    return `${f(m[1])}–${f(m[2])}${m[3] ? ` ${m[3].replace(/^m$/, t("ab.m", { v: "" }).trim())}` : ""}`;
  }

  // Capped stats stop at the cap ("damage reduction cap 90%").
  const capped = (s: AbilityStat, mul: number) => s.max != null && s.n != null && s.n * mul > s.max;
  function fmt(s: AbilityStat, mul: number): string {
    if (s.n == null) return range(s.v, mul);
    const v = capped(s, mul) ? s.max! : s.n * mul;
    const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
    const text = num(+v.toFixed(digits));
    switch (s.u) {
      case "x":
        return `${text}x`;
      case "%":
        return `${text}%`;
      case "s":
        return t("ab.sec", { v: text });
      case "m":
        return t("ab.m", { v: text });
      case "ps":
        return t("ab.perSec", { v: text });
      case "mps":
        return t("ab.mPerSec", { v: text });
      default:
        return text;
    }
  }
  const mulOf = (k: Kind) => (k === "misc" ? 1 : mods[k] / 100);
  const rows = $derived(
    st
      ? (["str", "dur", "rng", "misc"] as Kind[]).flatMap((k) =>
          st[k].map((s) => ({ k, s, label: s.l || KIND_LABEL[k](), mul: s.n == null && !RANGE.test(s.v) ? 1 : mulOf(k) })),
        )
      : [],
  );
  // No fixed cost (channelled, per mark, Heat, Rubble...): no cost row.
  const cost = $derived(st?.cost ? abilityCost(st.cost, mods.eff) : null);
  const trend = (mul: number) => (mul > 1.0001 ? "up" : mul < 0.9999 ? "down" : "");
</script>

<div class="ab" class:compact>
  {#if cost != null}
    <div class="row cost">
      <span class="lbl">{t("ab.cost")}</span>
      <span class="val {cost > st!.cost! + 0.01 ? 'down' : cost < st!.cost! - 0.01 ? 'up' : ''}">
        {num(Math.round(cost))}
      </span>
    </div>
  {/if}
  {#each rows as r, i (i)}
    <div class="row k-{r.k}" title={r.k === "misc" ? t("ab.miscHint") : t("ab.scales", { stat: KIND_LABEL[r.k]() })}>
      <span class="lbl">{r.label}</span>
      <span class="val {trend(r.mul)}" title={capped(r.s, r.mul) ? t("ab.capped", { v: num(r.s.max!) }) : undefined}>
        {fmt(r.s, r.mul)}{#if capped(r.s, r.mul)}<small class="cap">{t("ab.cap")}</small>{/if}
      </span>
    </div>
  {/each}
  {#if !st}
    <p class="none">{t("ab.noStats")}</p>
  {/if}
</div>

<style>
  .cap {
    margin-left: 4px;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-faint);
  }
  .ab {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 8px 4px 10px;
    border-radius: 6px;
    position: relative;
  }
  .row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.035);
  }
  /* Which build stat the row follows: a thin colored mark on the left (legend in the panel). */
  .row::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 2px;
  }
  .k-str::before {
    background: var(--ab-str);
  }
  .k-dur::before {
    background: var(--ab-dur);
  }
  .k-rng::before {
    background: var(--ab-rng);
  }
  .cost::before {
    background: var(--ab-eff);
  }
  .lbl {
    color: var(--text-dim);
    min-width: 0;
  }
  .lbl::first-letter {
    text-transform: uppercase;
  }
  .val {
    flex: none;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .val.up {
    color: var(--good);
  }
  .val.down {
    color: #e2706a;
  }
  .compact {
    font-size: 12.5px;
  }
  .compact .row {
    padding: 3px 6px 3px 9px;
  }
  .none {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
