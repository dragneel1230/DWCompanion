<script lang="ts">
  // "Реликвии": the player's relics with the average platinum one opening gives (solo by refinement,
  // and a radiant 4-player radshare), and what the relic itself fetches on the market (asks / bids).
  import { iconUrl } from "$lib/db";
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { REFINE_RU, type Refine } from "$lib/relicValue";
  import Cur from "$lib/components/Cur.svelte";
  import type { RelicStack } from "./worth";

  let { stacks }: { stacks: RelicStack[] } = $props();

  const ERAS = ["Lith", "Meso", "Neo", "Axi", "Requiem"];
  // Era names as the game writes them ("Лит" / "Lith"): the first word of a relic's short name.
  const ERA_NAME = $derived<Record<string, string>>(Object.fromEntries(stacks.map((s) => [s.relic.era, s.relic.s.split(" ")[0]])));
  const REF: Refine[] = ["intact", "exceptional", "flawless", "radiant"];
  type Sort = "value" | "count" | "ev";
  let era = $state("all");
  let vaultedOnly = $state(false);
  let sort = $state<Sort>("value");
  const SORTS: { id: Sort; label: Key }[] = [
    { id: "value", label: "inv.relics.byValue" },
    { id: "ev", label: "inv.relics.byEv" },
    { id: "count", label: "inv.relics.byCount" },
  ];

  // What the stack is worth opened as it is (each refinement at its own chances).
  const stackEv = (s: RelicStack) => REF.reduce((n, f) => n + (s.counts[f] ?? 0) * s.ev[f], 0);
  // Selling beats opening: buyers pay more than an intact opening averages.
  const sellBetter = (s: RelicStack) => {
    const get = Math.min(s.ask ?? Infinity, s.bid ?? Infinity); // a seller gets at most this
    return Number.isFinite(get) && get > s.ev.intact * 1.15 && get >= 3;
  };

  const list = $derived.by(() => {
    const out = stacks.filter((s) => (era === "all" || s.relic.era === era) && (!vaultedOnly || s.relic.vaulted));
    const key: Record<Sort, (s: RelicStack) => number> = { value: stackEv, ev: (s) => s.ev.intact, count: (s) => s.total };
    return out.sort((a, b) => key[sort](b) - key[sort](a));
  });
  const sum = $derived({ n: list.reduce((s, x) => s + x.total, 0), ev: list.reduce((s, x) => s + stackEv(x), 0) });
  const short = (f: Refine) => REFINE_RU[f].slice(0, 1).toUpperCase();
</script>

<div class="bar">
  <div class="seg">
    <button class:on={era === "all"} onclick={() => (era = "all")}>{t("mp.all")}</button>
    {#each ERAS as e (e)}
      {#if stacks.some((s) => s.relic.era === e)}<button class:on={era === e} onclick={() => (era = e)}>{ERA_NAME[e] ?? e}</button>{/if}
    {/each}
  </div>
  <label class="chk"><input type="checkbox" bind:checked={vaultedOnly} /> {t("inv.relics.vaulted")}</label>
  <div class="seg">{#each SORTS as s (s.id)}<button class:on={sort === s.id} onclick={() => (sort = s.id)}>{t(s.label)}</button>{/each}</div>
</div>

<div class="sum">
  <span>{t("inv.relics.count", { n: sum.n })}</span>
  <span>{t("inv.relics.evTotal")} <b><Cur kind="plat" value={Math.round(sum.ev)} size={15} /></b></span>
  <span class="hint">{t("inv.relics.hint")}</span>
</div>

<div class="rows">
  <div class="row head">
    <span class="ic"></span>
    <span class="name">{t("inv.relics.relic")}</span>
    <span class="cnt">{t("inv.relics.have")}</span>
    <span class="ev">{t("inv.relics.evSolo")}</span>
    <span class="ev">{t("inv.relics.evSquad")}</span>
    <span class="mk">{t("inv.relics.market")}</span>
  </div>
  {#each list as s (s.key)}
    <a class="row line" href="/relic?id={encodeURIComponent(s.key)}">
      <img class="ic" src={iconUrl(s.relic.icon)} alt="" loading="lazy" />
      <span class="name">
        <b>{s.relic.s}</b>
        <small>
          {#if s.relic.vaulted}<span class="tag vaulted">{t("tag.inVault")}</span>{:else}<span class="tag active">{t("tag.dropsNow")}</span>{/if}
          {#if s.goal}<span class="tag gold">{t("inv.relics.goal")}</span>{/if}
          {#if sellBetter(s)}<span class="tag sell" title={t("inv.relics.sellHint")}>{t("inv.relics.sell")}</span>{/if}
        </small>
      </span>
      <span class="cnt">
        {#each REF as f (f)}
          {#if s.counts[f]}<i class="rf {f}" title={REFINE_RU[f]}>{short(f)}<b>{s.counts[f]}</b></i>{/if}
        {/each}
      </span>
      <span class="ev">
        <Cur kind="plat" value={Math.round(s.ev.intact * 10) / 10} size={12} />
        <small>{short("radiant")} <Cur kind="plat" value={Math.round(s.ev.radiant * 10) / 10} size={11} /></small>
      </span>
      <span class="ev"><Cur kind="plat" value={Math.round(s.squad * 10) / 10} size={12} /></span>
      <span class="mk">
        {#if s.ask != null || s.bid != null}
          <small>{t("inv.relics.ask")} {s.ask != null ? num(s.ask) : "—"}</small>
          <small>{t("inv.relics.bid")} {s.bid != null ? num(s.bid) : "—"}</small>
        {:else}—{/if}
      </span>
    </a>
  {:else}
    <p class="empty">{t("inv.relics.empty")}</p>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .chk {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .chk input {
    accent-color: var(--accent);
  }
  .sum {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 16px;
    margin: 0 4px 10px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .sum b {
    font-size: 15px;
  }
  .hint {
    color: var(--text-faint);
  }
  .row.line {
    gap: 14px;
    color: var(--text);
  }
  .row.head {
    gap: 14px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    padding-top: 6px;
    padding-bottom: 6px;
  }
  .ic {
    width: 36px;
    height: 36px;
    object-fit: contain;
    flex: none;
  }
  .name b {
    font-weight: 500;
  }
  .name small {
    display: flex;
    gap: 4px;
    margin-top: 3px;
  }
  .tag.gold {
    color: var(--accent);
    border-color: rgba(201, 166, 107, 0.4);
  }
  .tag.sell {
    color: var(--plat);
    border-color: rgba(143, 184, 255, 0.35);
  }
  .cnt {
    width: 170px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .rf {
    font-style: normal;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-dim);
  }
  .rf b {
    margin-left: 3px;
    color: var(--text);
    font-weight: 600;
  }
  .rf.radiant {
    background: rgba(201, 166, 107, 0.14);
    color: var(--accent);
  }
  .rf.flawless {
    background: rgba(192, 199, 212, 0.1);
  }
  .ev {
    width: 86px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-size: 13px;
  }
  .ev small {
    font-size: 11px;
    color: var(--text-faint);
    display: flex;
    gap: 3px;
    align-items: center;
  }
  .mk {
    width: 84px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 12px;
    color: var(--text-dim);
  }
  .empty {
    padding: 18px;
    color: var(--text-dim);
    margin: 0;
  }
</style>
