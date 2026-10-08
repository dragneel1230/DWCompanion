<script lang="ts">
  // Closed-trade prices of one item: median line, min–max band, the player's price as a dashed line.
  // Hover shows the day (or hour) under the cursor.
  import { num, locale, t } from "$lib/i18n/index.svelte";
  import type { StatPoint } from "./market.svelte";

  let { points, mine = null, hours = false }: { points: StatPoint[]; mine?: number | null; hours?: boolean } = $props();

  const W = 520;
  const H = 150;
  const PAD = { l: 34, r: 8, t: 10, b: 20 };

  let el = $state<SVGSVGElement>();
  let hover = $state<number | null>(null);

  const geo = $derived.by(() => {
    if (points.length < 2) return null;
    const vals = points.flatMap((p) => [p.median, Math.min(p.max, p.median * 3)]);
    if (mine != null) vals.push(mine);
    let lo = Math.min(...points.map((p) => p.min), ...(mine != null ? [mine] : []));
    let hi = Math.max(...vals);
    if (hi - lo < 4) {
      hi += 2;
      lo -= 2;
    }
    lo = Math.max(0, lo);
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (Math.min(v, hi) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.median).toFixed(1)}`).join("");
    const band =
      points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(Math.min(p.max, hi)).toFixed(1)}`).join("") +
      [...points].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.min).toFixed(1)}`).join("") +
      "Z";
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => ({ v: Math.round(v), y: y(v) }));
    return { x, y, line, band, ticks };
  });

  function move(e: PointerEvent) {
    if (!el || !geo) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let d = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(geo.x(p.t) - px);
      if (dd < d) {
        d = dd;
        best = i;
      }
    });
    hover = best;
  }

  const fmtT = (ms: number) =>
    new Date(ms).toLocaleString(locale(), hours ? { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
  const hp = $derived(hover != null ? points[hover] : null);
</script>

{#if geo}
  <div class="chart">
    <svg bind:this={el} viewBox="0 0 {W} {H}" onpointermove={move} onpointerleave={() => (hover = null)} role="img" aria-label={t("trade.chart")}>
      {#each geo.ticks as tk}
        <line x1={PAD.l} x2={W - PAD.r} y1={tk.y} y2={tk.y} class="grid" />
        <text x={PAD.l - 6} y={tk.y + 3.5} class="ax" text-anchor="end">{tk.v}</text>
      {/each}
      <path d={geo.band} class="band" />
      <path d={geo.line} class="line" />
      {#if mine != null}
        <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(mine)} y2={geo.y(mine)} class="mine" />
        <text x={W - PAD.r} y={geo.y(mine) - 4} class="ax mineLbl" text-anchor="end">{t("trade.chart.mine", { v: num(mine) })}</text>
      {/if}
      <text x={PAD.l} y={H - 4} class="ax">{fmtT(points[0].t)}</text>
      <text x={W - PAD.r} y={H - 4} class="ax" text-anchor="end">{fmtT(points[points.length - 1].t)}</text>
      {#if hp}
        <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={PAD.t} y2={H - PAD.b} class="cross" />
        <circle cx={geo.x(hp.t)} cy={geo.y(hp.median)} r="4" class="dot" />
      {/if}
    </svg>
    {#if hp && geo}
      <div class="tip" style:left="{Math.min(84, Math.max(16, (geo.x(hp.t) / W) * 100))}%">
        <b>{fmtT(hp.t)}</b>
        <span>{t("trade.chart.median")} <em>{num(hp.median)}</em></span>
        <span>{t("trade.chart.range")} {num(hp.min)}–{num(hp.max)}</span>
        <span>{t("trade.chart.volume")} {num(hp.volume)}</span>
      </div>
    {/if}
  </div>
{:else}
  <p class="empty">{t("trade.chart.none")}</p>
{/if}

<style>
  .chart {
    position: relative;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .ax {
    fill: var(--text-faint);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .band {
    fill: var(--accent-soft);
  }
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .mine {
    stroke: var(--plat);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
  }
  .mineLbl {
    fill: var(--plat);
  }
  .cross {
    stroke: var(--text-faint);
    stroke-width: 1;
  }
  .dot {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 9px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--line);
    font-size: 11.5px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .tip b {
    color: var(--text);
    font-weight: 500;
  }
  .tip em {
    font-style: normal;
    color: var(--text);
  }
  .empty {
    font-size: 12.5px;
    color: var(--text-faint);
  }
</style>
