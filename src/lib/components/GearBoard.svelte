<script lang="ts">
  // Build board for gear besides warframes (gear.ts): weapons, companions, archwings, necramechs. Like BuildBoard:
  // rank, capacity and stats on the left; stance / exilus, the mod slots and the arcane in the middle.
  // Editable: click a slot to pick a mod, click a polarity chip to forma the slot.
  import { num, t, type Key } from "$lib/i18n/index.svelte";
  import { POLARITY_RU, SLOT_POLARITIES, type FramesDb, type Mod, type Polarity } from "$lib/frames";
  import {
    arcanesForGear,
    DMG_TYPES,
    gearCapacity,
    gearForma,
    isWeapon,
    modsForGear,
    suitStats,
    weaponStats,
    type Gear,
    type GearBuild,
    type GearCtx,
    type GearSlot,
  } from "$lib/gear";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";
  import ModTooltip from "./ModTooltip.svelte";
  import ModPicker from "./ModPicker.svelte";
  import FloatTip from "./FloatTip.svelte";
  import PolIcon from "./PolIcon.svelte";

  let { ctx, fdb, gear, build = $bindable(), editable = false }: { ctx: GearCtx; fdb: FramesDb; gear: Gear; build: GearBuild; editable?: boolean } = $props();

  type Picking = { kind: "mod"; slot: GearSlot } | { kind: "arcane" };
  let picking = $state<Picking | null>(null);
  let polMenu = $state<GearSlot | null>(null);
  let hoverMod = $state<{ el: HTMLElement; mod: Mod; rank: number } | null>(null);

  const forma = $derived(gearForma(gear, build.pols));
  const cap = $derived(gearCapacity(ctx, gear, build));
  const ws = $derived(weaponStats(ctx, gear, build));
  const ss = $derived(suitStats(ctx, gear, build));
  const used = $derived(new Set([build.exilus, build.stance, ...build.slots, ...build.arcanes].filter((x): x is string => !!x)));
  const cols = $derived(gear.slots === 10 ? 5 : 4);

  const modAt = (s: GearSlot) => (s === "exilus" ? build.exilus : s === "stance" ? build.stance : build.slots[s]);
  const polAt = (s: GearSlot) => (s === "exilus" ? build.pols?.exilus : s === "stance" ? build.pols?.stance : build.pols?.slots[s]) ?? null;
  const rankAt = (s: GearSlot) => (s === "exilus" ? build.ranks?.exilus : s === "stance" ? build.ranks?.stance : build.ranks?.slots[s]) ?? null;
  const changedAt = (s: GearSlot) => (s === "exilus" ? forma.exilus : s === "stance" ? forma.stance : forma.slots[s]);

  function ensure() {
    build.pols ??= { slots: Array(gear.slots).fill(null), exilus: gear.exPol ?? null, stance: gear.stPol ?? null };
    build.ranks ??= { slots: Array(gear.slots).fill(null), exilus: null, stance: null };
  }
  function setMod(s: GearSlot, id: string | null) {
    ensure();
    if (s === "exilus") (build.exilus = id), (build.ranks!.exilus = null);
    else if (s === "stance") (build.stance = id), (build.ranks!.stance = null);
    else (build.slots[s] = id), (build.ranks!.slots[s] = null);
  }
  function setRank(s: GearSlot, r: number) {
    ensure();
    if (s === "exilus") build.ranks!.exilus = r;
    else if (s === "stance") build.ranks!.stance = r;
    else build.ranks!.slots[s] = r;
  }
  function setPol(s: GearSlot, p: Polarity | null) {
    ensure();
    if (s === "exilus") build.pols!.exilus = p;
    else if (s === "stance") build.pols!.stance = p;
    else build.pols!.slots[s] = p;
    polMenu = null;
  }

  const slotTitle = (s: GearSlot) => (s === "exilus" ? t("bb.exilus") : s === "stance" ? t("gb.stance") : t("bb.slot", { n: s + 1 }));
  const int = (n: number) => num(Math.round(n));
  const pct = (n: number) => `${num(n * 100, 1)}%`;
  const melee = $derived(gear.kind === "melee" || gear.kind === "archmelee" || (gear.kind === "cweapon" && !!gear.w?.range));
</script>

{#snippet polChip(s: GearSlot)}
  {@const pol = polAt(s)}
  {@const mod = modAt(s) ? ctx.mods[modAt(s)!] : null}
  {@const match = !!mod && !!pol && (pol === mod.pol || pol === "any")}
  <div class="chip-wrap">
    <svelte:element
      this={editable ? "button" : "div"}
      role={editable ? "button" : undefined}
      class="chip"
      class:forma={changedAt(s)}
      class:match
      title={`${pol ? POLARITY_RU[pol] : t("bb.noPol")}${changedAt(s) ? ` · ${t("bb.formaChanged")}` : ""}`}
      onclick={() => editable && (polMenu = polMenu === s ? null : s)}
    >
      {#if pol}<PolIcon {pol} size={13} />{:else}<span class="dash">–</span>{/if}
      {#if editable}<span class="caret">▾</span>{/if}
    </svelte:element>
    {#if polMenu === s}
      <div class="menu">
        <button onclick={() => setPol(s, null)} title={t("bb.noPol")}><span class="dash">–</span></button>
        {#each SLOT_POLARITIES as p}
          <button class:on={p === pol} onclick={() => setPol(s, p)} title={POLARITY_RU[p]}><PolIcon pol={p} size={15} /></button>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet slot(s: GearSlot)}
  {@const id = modAt(s)}
  {@const mod = id ? (ctx.mods[id] ?? null) : null}
  {@const rank = mod ? Math.min(rankAt(s) ?? mod.max, mod.max) : 0}
  <div class="slot">
    {@render polChip(s)}
    <ModCard
      {mod}
      slotPol={polAt(s)}
      {rank}
      polRow={false}
      label={s === "exilus" ? "exilus" : s === "stance" ? "stance" : ""}
      onclick={editable ? () => (picking = { kind: "mod", slot: s }) : undefined}
      onhover={(el) => (hoverMod = el && mod ? { el, mod, rank } : null)}
    />
  </div>
{/snippet}

{#snippet stat(label: string, v: string, base: string | null, hint?: string)}
  <dt title={hint}>{label}</dt>
  <dd>{v}{#if base != null && base !== v}<small>{base}</small>{/if}</dd>
{/snippet}

<div class="wrap">
  <aside class="side">
    <div class="rankrow">
      <span>{t("bb.rank")}</span>
      {#if editable}
        <input type="number" min="0" max={gear.maxRank} bind:value={build.rank} />
      {:else}
        <b>{build.rank ?? 30}</b>
      {/if}
    </div>
    <div class="capbar" class:over={cap.used > cap.total}>
      <div class="fill" style:width="{Math.min(100, (cap.used / Math.max(1, cap.total)) * 100)}%"></div>
      <span>{cap.used} / {cap.total}</span>
    </div>
    <label class="toggle">
      <span>{isWeapon(gear.kind) ? t("gb.catalyst") : t("bb.reactor")}</span>
      <input type="checkbox" checked={build.catalyst !== false} disabled={!editable} onchange={(e) => (build.catalyst = e.currentTarget.checked)} />
    </label>

    {#if ws && gear.w}
      {@const w = gear.w}
      <dl class="stats">
        {@render stat(t("gb.dmg"), num(ws.total, 1), num(w.dmg.reduce((a, x) => a + x, 0), 1))}
        {@render stat(t("gb.cc"), pct(ws.cc), pct(w.cc))}
        {@render stat(t("gb.cm"), `${num(ws.cm, 2)}x`, `${num(w.cm, 2)}x`)}
        {@render stat(t("gb.sc"), pct(ws.sc), pct(w.sc))}
        {@render stat(melee ? t("gb.as") : t("gb.fr"), num(ws.fr, 2), num(w.fr, 2))}
        {#if !melee}{@render stat(t("gb.ms"), num(ws.ms, 2), num(w.ms, 2))}{/if}
        {#if ws.mag != null}{@render stat(t("gb.mag"), num(ws.mag), num(w.mag ?? 0))}{/if}
        {#if ws.rel != null}{@render stat(t("gb.rel"), `${num(ws.rel, 2)} ${t("gb.s")}`, `${num(w.rel ?? 0, 2)} ${t("gb.s")}`)}{/if}
        {#if ws.range != null}{@render stat(t("gb.range"), `${num(ws.range, 1)} ${t("gb.m")}`, `${num(w.range ?? 0, 1)} ${t("gb.m")}`)}{/if}
      </dl>
      <div class="types">
        {#each DMG_TYPES as dt, i}
          {#if ws.dmg[i] > 0.05}
            <span class="dt {dt}">{t(`dt.${dt}` as Key)} <b>{num(ws.dmg[i], 1)}</b></span>
          {/if}
        {/each}
      </div>
      <dl class="stats">
        {@render stat(t("gb.avg"), int(ws.avg), null, t("gb.avgHint"))}
        {@render stat(t("gb.burst"), int(ws.burst), null, t("gb.burstHint"))}
        {#if ws.mag != null && ws.rel != null}{@render stat(t("gb.sus"), int(ws.sustained), null, t("gb.susHint"))}{/if}
      </dl>
    {:else if ss && gear.d}
      <dl class="stats">
        {@render stat(t("stat.health"), int(ss.health), int(gear.d.health))}
        {@render stat(t("stat.shield"), int(ss.shield), int(gear.d.shield))}
        {@render stat(t("stat.armor"), int(ss.armor), int(gear.d.armor))}
        {@render stat(t("stat.energy"), int(ss.energy), int(gear.d.energy))}
      </dl>
      {#if ss.str !== 100 || ss.dur !== 100 || ss.rng !== 100 || ss.eff !== 100}
        <dl class="stats">
          {@render stat(t("bb.str"), `${Math.round(ss.str)}%`, null)}
          {@render stat(t("bb.dur"), `${Math.round(ss.dur)}%`, null)}
          {@render stat(t("bb.rng"), `${Math.round(ss.rng)}%`, null)}
          {@render stat(t("bb.eff"), `${Math.round(ss.eff)}%`, null)}
        </dl>
      {/if}
    {/if}
    <p class="note">{ws ? t("gb.noteWeapon") : t("gb.noteSuit")}</p>
  </aside>

  <section class="board">
    {#if gear.stance || gear.exilus}
      <div class="line2 top">
        {#if gear.stance}{@render slot("stance")}{/if}
        {#if gear.exilus}{@render slot("exilus")}{/if}
      </div>
    {/if}
    <div class="grid" style:grid-template-columns="repeat({cols}, auto)">
      {#each { length: gear.slots } as _, i}
        {@render slot(i)}
      {/each}
    </div>
    {#if gear.arcane}
      <div class="line2 arcanes">
        {#if build.arcanes[0] && ctx.arcanes[build.arcanes[0]]}
          <ArcaneCard arcane={ctx.arcanes[build.arcanes[0]]} scale={0.26} onclick={editable ? () => (picking = { kind: "arcane" }) : undefined} />
        {:else if editable}
          <button class="arc-empty" onclick={() => (picking = { kind: "arcane" })}>+ {t("kind.arcane")}</button>
        {/if}
      </div>
    {/if}
  </section>
</div>

<FloatTip anchor={hoverMod?.el ?? null}>
  {#if hoverMod}<ModTooltip db={fdb} mod={hoverMod.mod} rank={hoverMod.rank} scale={0.8} />{/if}
</FloatTip>

{#if picking}
  {@const p = picking}
  <ModPicker
    db={fdb}
    kind={p.kind === "arcane" ? "arcane" : p.slot === "exilus" ? "exilus" : p.slot === "stance" ? "stance" : "slot"}
    items={p.kind === "arcane" ? arcanesForGear(ctx, gear) : modsForGear(ctx, gear, p.slot)}
    title={p.kind === "arcane" ? t("kind.arcane") : slotTitle(p.slot)}
    current={p.kind === "arcane" ? (build.arcanes[0] ?? null) : modAt(p.slot)}
    rank={p.kind === "arcane" ? null : rankAt(p.slot)}
    {used}
    onpick={(id) => {
      if (p.kind === "arcane") build.arcanes = id ? [id] : [];
      else setMod(p.slot, id);
      picking = null;
    }}
    onrank={(r) => p.kind === "mod" && setRank(p.slot, r)}
    onclose={() => (picking = null)}
  />
{/if}

<style>
  .wrap {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }
  .rankrow,
  .toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .rankrow input {
    width: 56px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--bg);
    text-align: right;
  }
  .toggle input {
    accent-color: var(--accent);
  }
  .capbar {
    position: relative;
    height: 18px;
    border-radius: 9px;
    background: var(--surface-2);
    overflow: hidden;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 600;
  }
  .capbar .fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: rgba(111, 207, 151, 0.45);
  }
  .capbar.over .fill {
    width: 100% !important;
    background: rgba(255, 123, 107, 0.5);
  }
  .capbar span {
    position: relative;
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 8px;
    margin: 6px 0 0;
  }
  .stats dt {
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .stats dd {
    margin: 0;
    text-align: right;
    color: var(--plat);
    font-variant-numeric: tabular-nums;
  }
  .stats dd small {
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-faint);
    text-decoration: line-through;
  }
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .dt {
    padding: 2px 7px;
    border-radius: 6px;
    font-size: 11.5px;
    background: var(--surface-2);
    border-left: 3px solid var(--c, var(--line));
  }
  .dt b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .dt.impact { --c: #9fb3c8; }
  .dt.puncture { --c: #c7b98f; }
  .dt.slash { --c: #d08a8a; }
  .dt.heat { --c: #ff7a3d; }
  .dt.cold { --c: #7fd3ff; }
  .dt.electricity { --c: #b48cff; }
  .dt.toxin { --c: #5fd86a; }
  .dt.blast { --c: #ffb547; }
  .dt.radiation { --c: #e8e05a; }
  .dt.gas { --c: #9ec96b; }
  .dt.magnetic { --c: #5f8dff; }
  .dt.viral { --c: #4fc9a8; }
  .dt.corrosive { --c: #b9d94a; }
  .dt.void { --c: #f2e3a6; }
  .dt.tau { --c: #e6ecf5; }
  .note {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--text-faint);
  }
  .board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 18px 12px;
    border-radius: 14px;
    background: radial-gradient(ellipse at 50% 0%, rgba(201, 166, 107, 0.07), transparent 60%), var(--surface);
    container-type: inline-size;
  }
  @container (max-width: 894px) {
    .board > :global(*) {
      zoom: 0.88;
    }
  }
  @container (max-width: 787px) {
    .board > :global(*) {
      zoom: 0.78;
    }
  }
  @container (max-width: 698px) {
    .board > :global(*) {
      zoom: 0.68;
    }
  }
  @container (max-width: 609px) {
    .board > :global(*) {
      zoom: 0.58;
    }
  }
  .line2 {
    display: flex;
    gap: 14px;
  }
  .grid {
    display: grid;
    gap: 4px 10px;
  }
  .slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .arcanes {
    margin-top: 8px;
    min-height: 40px;
    align-items: center;
  }
  .arc-empty {
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px dashed var(--line);
    color: var(--text-faint);
    font-size: 12px;
  }
  .arc-empty:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
  .chip-wrap {
    position: relative;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    background: var(--bg);
    border: 1px solid var(--line);
    color: var(--text-dim);
  }
  .chip.match {
    color: #5fe07a;
  }
  .chip.forma {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px rgba(201, 166, 107, 0.25);
  }
  .dash {
    font-size: 12px;
    line-height: 1;
  }
  .caret {
    font-size: 9px;
    color: var(--text-faint);
  }
  .menu {
    position: absolute;
    z-index: 20;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  }
  .menu button {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--text-dim);
  }
  .menu button:hover,
  .menu button.on {
    background: var(--bg);
    color: var(--text);
  }
</style>
