<script lang="ts">
  // "Изменения": what came and went between inventory snapshots. Relic picks found by comparing the
  // journal's cards with what actually arrived; things that left while a sell order is open look sold:
  // one click closes the order (the market counts the trade).
  import { getDb } from "$lib/db";
  import { locale, num, t } from "$lib/i18n/index.svelte";
  import { parseRelicText, REFINE_RU } from "$lib/relicValue";
  import { dayPrice } from "$lib/marketDay";
  import { wfm, type MyOrder } from "$lib/wfm.svelte";
  import { inventory, type InvChange } from "$lib/inventory.svelte";
  import Cur from "$lib/components/Cur.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import ArcaneCard from "$lib/components/ArcaneCard.svelte";
  import { describe, type InvCtx } from "./ctx";

  let { log, ctx }: { log: InvChange[]; ctx: InvCtx } = $props();

  const when = (ms: number) => new Date(ms).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const db = getDb();

  // Changes of one snapshot as rows with names, the most valuable first; mods by copies.
  function lines(c: InvChange, sign: 1 | -1) {
    const out: (ReturnType<typeof describe> & { id: string; n: number; value: number })[] = [];
    for (const [id, d] of [...Object.entries(c.items), ...Object.entries(c.mods)]) {
      if (Math.sign(d) !== sign) continue;
      const it = describe(ctx, id);
      out.push({ id, n: Math.abs(d), ...it, value: (dayPrice(it.slug)?.price ?? 0) * Math.abs(d) });
    }
    return out.sort((a, b) => b.value - a.value || b.n - a.n);
  }
  const orderOf = (slug: string | undefined): MyOrder | undefined => {
    const id = slug && ctx.wfmId.get(slug);
    return id ? wfm.orders.find((o) => o.type === "sell" && o.itemId === id) : undefined;
  };
  let closed = $state<Record<string, boolean>>({});
  async function close(o: MyOrder, n: number, key: string) {
    await wfm.close(o, Math.min(n, o.quantity));
    if (!wfm.error) closed[key] = true;
  }
  const relicLabel = (text: string | null) => {
    if (!text) return t("inv.log.relic");
    const { key, refine } = parseRelicText(text);
    return key ? `${db.relics[key].s} · ${REFINE_RU[refine]}` : text;
  };
  let open = $state<Record<number, boolean>>({});
</script>

{#if !log.length}
  <p class="empty">{t("inv.log.empty")}</p>
{:else}
  <div class="top">
    <span class="hint">{t("inv.log.hint")}</span>
    <button class="link" onclick={() => confirm(t("inv.log.clearAsk")) && inventory.clearLog()}>{t("inv.log.clear")}</button>
  </div>
  {#each log as c, ci (c.at)}
    {@const plus = lines(c, 1)}
    {@const minus = lines(c, -1)}
    {@const gain = plus.reduce((s, x) => s + x.value, 0)}
    <section class="chg">
      <header>
        <b>{when(c.at)}</b>
        <span class="tag">{c.auto ? t("inv.log.auto") : t("inv.log.manual")}</span>
        <span class="deltas">
          {#if plus.length}<span class="pl">+{plus.length}</span>{/if}
          {#if minus.length}<span class="mi">−{minus.length}</span>{/if}
          {#if gain >= 1}<span class="val">+<Cur kind="plat" value={Math.round(gain)} size={12} /></span>{/if}
          {#if c.plat}<span class={c.plat > 0 ? "pl" : "mi"}>{c.plat > 0 ? "+" : ""}<Cur kind="plat" value={c.plat} size={12} /></span>{/if}
          {#if c.ducats}<span class={c.ducats > 0 ? "pl" : "mi"}>{c.ducats > 0 ? "+" : ""}<Cur kind="ducats" value={c.ducats} size={12} /></span>{/if}
          {#if c.credits}<span class="cr">{c.credits > 0 ? "+" : ""}{num(c.credits)} {t("inv.log.cr")}</span>{/if}
        </span>
      </header>

      {#if c.picks.length}
        <div class="picks">
          {#each c.picks as p (p.entry)}
            {@const it = describe(ctx, p.item)}
            <div class="pick">
              <span class="rl">{relicLabel(p.relic)}</span>
              <span class="arrow">→</span>
              {#if it.icon}<img src={it.icon} alt="" />{/if}
              <b>{it.name}</b>
              <span class="ok">✓ {t("inv.log.picked")}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#each [{ list: plus, cls: "in" }, { list: minus, cls: "out" }] as g (g.cls)}
        {#if g.list.length}
          {@const all = open[ci * 2 + (g.cls === "in" ? 0 : 1)]}
          <div class="chips {g.cls}">
            {#each all ? g.list : g.list.slice(0, 12) as x (x.id)}
              {@const o = g.cls === "out" ? orderOf(x.slug) : undefined}
              <span class="chip">
                {#if x.mod}<span class="card"><ModCard mod={x.mod} scale={0.12} bare /></span>{:else if x.arcane}<span class="card"><ArcaneCard arcane={x.arcane} scale={0.06} bare /></span>{:else if x.icon}<img src={x.icon} alt="" loading="lazy" />{/if}
                {g.cls === "in" ? "+" : "−"}{x.n > 1 ? `${x.n} ` : ""}{x.name}
                {#if x.value >= 1}<i><Cur kind="plat" value={Math.round(x.value)} size={11} /></i>{/if}
                {#if o && !closed[`${c.at}${x.id}`]}
                  <button class="sold" disabled={wfm.busy === o.id} onclick={() => close(o, x.n, `${c.at}${x.id}`)} title={t("inv.log.soldHint")}>
                    {t("inv.log.sold")}
                  </button>
                {:else if closed[`${c.at}${x.id}`]}<i class="okc">✓</i>{/if}
              </span>
            {/each}
            {#if !all && g.list.length > 12}
              <button class="more" onclick={() => (open[ci * 2 + (g.cls === "in" ? 0 : 1)] = true)}>{t("inv.log.more", { n: g.list.length - 12 })}</button>
            {/if}
          </div>
        {/if}
      {/each}
    </section>
  {/each}
{/if}

<style>
  .empty {
    color: var(--text-dim);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .hint {
    font-size: 12px;
    color: var(--text-faint);
  }
  .link {
    font-size: 12px;
    color: var(--text-dim);
  }
  .chg {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 10px;
    border-radius: 14px;
    background: var(--glass);
    border: 1px solid var(--glass-line);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  header b {
    font-weight: 600;
  }
  .deltas {
    margin-left: auto;
    display: flex;
    gap: 10px;
    font-size: 12.5px;
  }
  .pl {
    color: var(--good);
  }
  .mi {
    color: var(--warn);
  }
  .val {
    color: var(--plat);
  }
  .cr {
    color: var(--text-dim);
  }
  .picks {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(201, 166, 107, 0.07);
    border: 1px solid rgba(201, 166, 107, 0.2);
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .pick img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .pick b {
    font-weight: 500;
  }
  .rl {
    color: var(--text-dim);
  }
  .arrow {
    color: var(--text-faint);
  }
  .ok {
    margin-left: auto;
    font-size: 11px;
    color: var(--good);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 4px;
    border-radius: 999px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.04);
  }
  .chip img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .chip i {
    font-style: normal;
  }
  .chip .card {
    display: flex;
  }
  .in .chip {
    color: var(--text);
  }
  .out .chip {
    color: var(--text-dim);
  }
  .sold {
    margin-left: 2px;
    padding: 0 7px;
    border-radius: 999px;
    font-size: 11px;
    color: #111;
    background: var(--good);
  }
  .okc {
    color: var(--good);
  }
  .more {
    font-size: 12px;
    color: var(--accent);
  }
</style>
