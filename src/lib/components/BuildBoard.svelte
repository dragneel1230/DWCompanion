<script lang="ts">
  // Build editor / viewer in the style of the in-game arsenal: abilities, rank, capacity and stats
  // on the left; aura, exilus, 8 slots with their polarities and arcanes in the middle.
  // Editable: click a slot to pick a mod, click a polarity chip to forma the slot.
  import { num, t } from "$lib/i18n/index.svelte";
  import { iconUrl } from "$lib/db";
  import {
    buildCapacity,
    buildStats,
    formaInfo,
    rankOf,
    setCounts,
    SLOT_POLARITIES,
    POLARITY_RU,
    type Build,
    type Frame,
    type FramesDb,
    type Mod,
    type Polarity,
  } from "$lib/frames";
  import ModCard from "./ModCard.svelte";
  import ArcaneCard from "./ArcaneCard.svelte";
  import ModTooltip from "./ModTooltip.svelte";
  import ModPicker from "./ModPicker.svelte";
  import FloatTip from "./FloatTip.svelte";
  import PolIcon from "./PolIcon.svelte";

  let { db, frame, build = $bindable(), editable = false }: { db: FramesDb; frame: Frame; build: Build; editable?: boolean } = $props();

  type SlotKey = "aura" | "exilus" | number; // number = mod slot 0..7
  type Picking = { kind: "mod"; slot: SlotKey } | { kind: "arcane"; index: number };

  let picking = $state<Picking | null>(null);
  let polMenu = $state<SlotKey | null>(null);
  let hoverMod = $state<{ el: HTMLElement; mod: Mod; rank: number } | null>(null);
  let hoverAbility = $state<{ el: HTMLElement; i: number } | null>(null);

  const forma = $derived(formaInfo(frame, build.pols));
  const cap = $derived(buildCapacity(db, build));
  const stats = $derived(buildStats(db, frame, build));
  const counts = $derived(setCounts(db, build));
  const used = $derived(new Set([build.aura, build.exilus, ...build.slots, ...build.arcanes].filter((x): x is string => !!x)));

  const modAt = (s: SlotKey) => (s === "aura" ? build.aura : s === "exilus" ? build.exilus : build.slots[s]);
  const polAt = (s: SlotKey) => (s === "aura" ? build.pols?.aura : s === "exilus" ? build.pols?.exilus : build.pols?.slots[s]) ?? null;
  const rankAt = (s: SlotKey) => (s === "aura" ? build.ranks?.aura : s === "exilus" ? build.ranks?.exilus : build.ranks?.slots[s]) ?? null;
  const changedAt = (s: SlotKey) => (s === "aura" ? forma.aura : s === "exilus" ? forma.exilus : forma.slots[s]);

  function ensure() {
    build.pols ??= { aura: frame.aura, exilus: null, slots: Array(8).fill(null) };
    build.ranks ??= { aura: null, exilus: null, slots: Array(8).fill(null) };
  }
  function setMod(s: SlotKey, id: string | null) {
    ensure();
    if (s === "aura") (build.aura = id), (build.ranks!.aura = null);
    else if (s === "exilus") (build.exilus = id), (build.ranks!.exilus = null);
    else (build.slots[s] = id), (build.ranks!.slots[s] = null);
  }
  function setRank(s: SlotKey, r: number) {
    ensure();
    if (s === "aura") build.ranks!.aura = r;
    else if (s === "exilus") build.ranks!.exilus = r;
    else build.ranks!.slots[s] = r;
  }
  function setPol(s: SlotKey, p: Polarity | null) {
    ensure();
    if (s === "aura") build.pols!.aura = p;
    else if (s === "exilus") build.pols!.exilus = p;
    else build.pols!.slots[s] = p;
    polMenu = null;
  }
  function setArcane(i: number, id: string | null) {
    const a = [...build.arcanes];
    if (id) a[i] = id;
    else a.splice(i, 1);
    build.arcanes = a.filter(Boolean);
  }

  const slotTitle = (s: SlotKey) => (s === "aura" ? t("bb.aura") : s === "exilus" ? t("bb.exilus") : t("bb.slot", { n: s + 1 }));
  const polOptions = (s: SlotKey): Polarity[] => (s === "aura" ? [...SLOT_POLARITIES.filter((p) => p !== "umbra"), "any"] : SLOT_POLARITIES);

  const int = (n: number) => num(Math.round(n));
  const pct = (n: number) => `${Math.round(n)}%`;
</script>

{#snippet polChip(s: SlotKey)}
  {@const pol = polAt(s)}
  {@const mod = modAt(s) ? db.mods[modAt(s)!] : null}
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
        {#each polOptions(s) as p}
          <button class:on={p === pol} onclick={() => setPol(s, p)} title={POLARITY_RU[p]}><PolIcon pol={p} size={15} /></button>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet slot(s: SlotKey)}
  {@const id = modAt(s)}
  {@const mod = id ? db.mods[id] : null}
  {@const rank = mod ? rankOf(mod, rankAt(s)) : 0}
  <div class="slot">
    {@render polChip(s)}
    <ModCard
      {mod}
      slotPol={polAt(s)}
      {rank}
      polRow={false}
      label={s === "aura" || s === "exilus" ? s : ""}
      onclick={editable ? () => (picking = { kind: "mod", slot: s }) : undefined}
      onhover={(el) => (hoverMod = el && mod ? { el, mod, rank } : null)}
    />
  </div>
{/snippet}

<div class="wrap">
  <aside class="side">
    <div class="abilities">
      {#each frame.abilities as a, i}
        <div
          class="ability"
          role="img"
          aria-label={a.name}
          onmouseenter={(e) => (hoverAbility = { el: e.currentTarget as HTMLElement, i })}
          onmouseleave={() => (hoverAbility = null)}
        >
          <img src={iconUrl(a.icon)} alt="" />
          <span>{i + 1}</span>
        </div>
      {/each}
    </div>

    <div class="rankrow">
      <span>{t("bb.rank")}</span>
      {#if editable}
        <input type="number" min="0" max="30" bind:value={build.rank} />
      {:else}
        <b>{build.rank ?? 30}</b>
      {/if}
    </div>
    <div class="capbar" class:over={cap.used > cap.total}>
      <div class="fill" style:width="{Math.min(100, (cap.used / Math.max(1, cap.total)) * 100)}%"></div>
      <span>{cap.used} / {cap.total}</span>
    </div>
    <label class="toggle">
      <span>{t("bb.reactor")}</span>
      <input type="checkbox" checked={build.reactor !== false} disabled={!editable} onchange={(e) => (build.reactor = e.currentTarget.checked)} />
    </label>

    <dl class="stats">
      <dt>{t("stat.health")}</dt><dd>{int(stats.health)}</dd>
      <dt>{t("stat.shield")}</dt><dd>{int(stats.shield)}</dd>
      <dt>{t("stat.armor")}</dt><dd>{int(stats.armor)}</dd>
      <dt>{t("stat.energy")}</dt><dd>{int(stats.energy)}</dd>
      <dt>{t("bb.sprint")}</dt><dd>{num(stats.sprint, 2)}</dd>
    </dl>
    <dl class="stats">
      <dt>{t("bb.str")}</dt><dd class:up={stats.str > 100} class:down={stats.str < 100}>{pct(stats.str)}</dd>
      <dt>{t("bb.dur")}</dt><dd class:up={stats.dur > 100} class:down={stats.dur < 100}>{pct(stats.dur)}</dd>
      <dt>{t("bb.rng")}</dt><dd class:up={stats.rng > 100} class:down={stats.rng < 100}>{pct(stats.rng)}</dd>
      <dt>{t("bb.eff")}</dt><dd class:up={stats.eff > 100} class:down={stats.eff < 100}>{pct(stats.eff)}</dd>
    </dl>
    <dl class="stats">
      <dt title={t("bb.ehpHint")}>{t("bb.ehp")}</dt><dd>{int(stats.ehp)}</dd>
      <dt>{t("bb.dr")}</dt><dd>{num(stats.dr * 100, 1)}%</dd>
    </dl>
    <p class="note">{t("bb.note")}</p>
  </aside>

  <section class="board">
    <div class="line2 top">
      {@render slot("aura")}
      {@render slot("exilus")}
    </div>
    <div class="grid">
      {#each { length: 8 } as _, i}
        {@render slot(i)}
      {/each}
    </div>
    <div class="line2 arcanes">
      {#each [0, 1] as i}
        {@const id = build.arcanes[i]}
        {#if id && db.arcanes[id]}
          <ArcaneCard arcane={db.arcanes[id]} scale={0.26} onclick={editable ? () => (picking = { kind: "arcane", index: i }) : undefined} />
        {:else if editable && i <= build.arcanes.length}
          <button class="arc-empty" onclick={() => (picking = { kind: "arcane", index: i })}>+ {t("kind.arcane")}</button>
        {/if}
      {/each}
    </div>
  </section>
</div>

<FloatTip anchor={hoverMod?.el ?? null}>
  {#if hoverMod}<ModTooltip {db} mod={hoverMod.mod} rank={hoverMod.rank} setCount={hoverMod.mod.set ? counts[hoverMod.mod.set] : 0} scale={0.8} />{/if}
</FloatTip>
<FloatTip anchor={hoverAbility?.el ?? null}>
  {#if hoverAbility}
    {@const a = frame.abilities[hoverAbility.i]}
    <div class="ability-tip">
      <b>{a.name}</b>
      <p>{a.desc}</p>
    </div>
  {/if}
</FloatTip>

{#if picking}
  {@const p = picking}
  <ModPicker
    {db}
    {frame}
    kind={p.kind === "arcane" ? "arcane" : p.slot === "aura" ? "aura" : p.slot === "exilus" ? "exilus" : "slot"}
    title={p.kind === "arcane" ? t("bb.arcaneN", { n: p.index + 1 }) : slotTitle(p.slot)}
    current={p.kind === "arcane" ? (build.arcanes[p.index] ?? null) : modAt(p.slot)}
    rank={p.kind === "arcane" ? null : rankAt(p.slot)}
    {used}
    onpick={(id) => {
      if (p.kind === "arcane") setArcane(p.index, id);
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
    grid-template-columns: 230px 1fr;
    gap: 24px;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 13px;
  }
  .abilities {
    display: flex;
    gap: 8px;
  }
  .ability {
    position: relative;
    width: 44px;
    height: 44px;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
  }
  .ability:hover {
    border-color: var(--accent);
  }
  .ability img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .ability span {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font-size: 10px;
    color: var(--accent);
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
  .stats dd.up {
    color: var(--good);
  }
  .stats dd.down {
    color: #ff7b6b;
  }
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
  }
  .line2 {
    display: flex;
    gap: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, auto);
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
    gap: 40px;
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
  .ability-tip {
    width: 320px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .ability-tip p {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-dim);
    white-space: pre-line;
  }
</style>
