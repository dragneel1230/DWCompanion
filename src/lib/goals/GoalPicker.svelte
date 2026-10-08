<script lang="ts">
  // "What do you want to get?": any warframe, weapon, companion, archwing, necramech or gear, prime or not.
  // The same index as the farming tab (typos, slang, wrong layout); an empty query lists everything by kind.
  import { t, type Key } from "$lib/i18n/index.svelte";
  import { iconUrl, normalize } from "$lib/db";
  import type { Mod } from "$lib/frames";
  import { owned as ownedMods } from "$lib/owned.svelte";
  import ModCard from "$lib/components/ModCard.svelte";
  import type { DropsDb } from "$lib/drops";
  import type { CraftDb } from "$lib/craft";
  import { buildIndex, findFarm, craftHint, type FarmEntry, type FarmKind } from "$lib/farm";
  import { profile } from "$lib/profile.svelte";
  import { bestXp, inventory } from "$lib/inventory.svelte";
  import { rankOf } from "$lib/mastery";
  import { goals } from "./goals.svelte";

  let {
    drops,
    craft,
    mods = null,
    onpick,
    oncancel,
  }: { drops: DropsDb; craft: CraftDb; mods?: Record<string, Mod> | null; onpick: (id: string) => void; oncancel?: () => void } = $props();

  type Kind = "all" | "frame" | "weapon" | "companion" | "mod" | "other";
  const KINDS: { id: Kind; label: Key }[] = [
    { id: "all", label: "goal.kind.all" },
    { id: "frame", label: "goal.kind.frame" },
    { id: "weapon", label: "goal.kind.weapon" },
    { id: "companion", label: "goal.kind.companion" },
    { id: "mod", label: "goal.kind.mod" },
    { id: "other", label: "goal.kind.other" },
  ];
  const GOAL_KINDS = new Set<FarmKind>(["frame", "weapon", "companion", "other"]);

  let query = $state("");
  // "Already have it": the public profile (anything ever ranked up). Hidden on request, remembered.
  let hideOwned = $state(readHide());
  function readHide() {
    try {
      return localStorage.getItem("dwc.goals.hideOwned") === "1";
    } catch {
      return false;
    }
  }
  function setHide(v: boolean) {
    hideOwned = v;
    try {
      localStorage.setItem("dwc.goals.hideOwned", v ? "1" : "0");
    } catch {
      // storage unavailable
    }
  }
  const FRAME_LIKE = new Set(["frame", "companion", "archwing", "mech"]);
  const owned = (e: FarmEntry): number | null => {
    const xp = bestXp(profile.data?.xp[e.id], e.id);
    return xp == null ? null : rankOf(xp, FRAME_LIKE.has(craft.items[e.id]?.kind ?? ""), 30);
  };
  let kind = $state<Kind>("all");
  let shown = $state(60);
  let input = $state<HTMLInputElement>();

  // Whole items only: no components, prime parts or resources (those are steps of a goal).
  const all = $derived(buildIndex(drops, craft).filter((e) => GOAL_KINDS.has(e.kind)));
  const index = $derived(hideOwned ? all.filter((e) => bestXp(profile.data?.xp[e.id], e.id) == null) : all);
  const byName = $derived([...index].sort((a, b) => a.name.localeCompare(b.name)));
  const list = $derived.by((): FarmEntry[] => {
    const k = kind === "all" ? null : kind;
    if (k === "mod") return [];
    if (query.trim()) return findFarm(index, query, k as FarmKind | null);
    return k ? byName.filter((e) => e.kind === k) : byName;
  });
  // Mods: same-named copies (Conclave versions etc.) once — the one on the market with more ranks (as search does).
  type ModRow = { id: string; mod: Mod; keys: string[] };
  const modAll = $derived.by((): ModRow[] => {
    const by = new Map<string, ModRow>();
    for (const [id, m] of Object.entries(mods ?? {})) {
      const o = by.get(m.ru)?.mod;
      if (!o || !!m.slug > !!o.slug || (!!m.slug === !!o.slug && m.max > o.max)) by.set(m.ru, { id, mod: m, keys: [normalize(m.ru), normalize(m.en)] });
    }
    return [...by.values()].sort((a, b) => a.mod.name.localeCompare(b.mod.name));
  });
  const modIndex = $derived(hideOwned ? modAll.filter((r) => !ownedMods.has(r.id)) : modAll);
  const modList = $derived.by((): ModRow[] => {
    const q = normalize(query.trim());
    if (kind !== "mod" && !(kind === "all" && q)) return [];
    return q ? modIndex.filter((r) => r.keys.some((k) => k.includes(q))) : modIndex;
  });
  const count = (k: Kind) => (k === "all" ? index.length + modIndex.length : k === "mod" ? modIndex.length : index.filter((e) => e.kind === k).length);

  $effect(() => {
    query;
    kind;
    shown = 60;
  });
  $effect(() => input?.focus());

  function onscroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 300) shown += 60;
  }
  const isPrime = (e: FarmEntry) => !!craft.items[e.id]?.bp;
</script>

<section class="panel picker">
  <div class="top">
    <div class="title">
      <h2>{t("goal.pick.title")}</h2>
      <p>{t("goal.pick.sub")}</p>
    </div>
    {#if oncancel}<button class="close" onclick={oncancel} title={t("goal.pick.cancel")}>✕</button>{/if}
  </div>
  <div class="controls">
    <input bind:this={input} bind:value={query} placeholder={t("goal.pick.placeholder")} spellcheck="false" />
    <div class="seg">
      {#each KINDS as k (k.id)}
        <button class:on={kind === k.id} onclick={() => (kind = k.id)}>{t(k.label)} <i>{count(k.id)}</i></button>
      {/each}
    </div>
    {#if profile.data || inventory.data}
      <label class="hide">
        <input type="checkbox" checked={hideOwned} onchange={(e) => setHide(e.currentTarget.checked)} />
        {t("goal.pick.hideOwned")}
      </label>
    {/if}
  </div>
  <div class="list" {onscroll}>
    {#if !list.length && !modList.length}
      <div class="empty"><b>{t("goal.pick.none")}</b><span>{t("goal.pick.noneHint")}</span></div>
    {/if}
    <div class="grid">
      {#each list.slice(0, shown) as e (e.id)}
        {@const rank = owned(e)}
        {@const inGoals = !!goals.get(e.id)}
        <button class="card" class:prime={isPrime(e)} class:owned={rank != null} onclick={() => onpick(e.id)}>
          <span class="ic">{#if e.icon}<img src={iconUrl(e.icon)} alt="" loading="lazy" />{/if}</span>
          <span class="txt">
            <b>{e.name}</b>
            <small>{craftHint(craft.items[e.id], drops) || e.en}</small>
          </span>
          {#if inGoals}
            <span class="badge goal">{t("goal.pick.inGoals")}</span>
          {:else if rank != null}
            <span class="badge" class:max={rank >= 30}>{rank >= 30 ? t("goal.pick.mastered") : t("goal.pick.owned", { n: rank })}</span>
          {:else}
            <span class="add">＋</span>
          {/if}
        </button>
      {/each}
      {#each modList.slice(0, Math.max(0, shown - list.length)) as r (r.id)}
        {@const inGoals = !!goals.get(r.id)}
        {@const have = ownedMods.has(r.id)}
        <button class="card" class:owned={have} onclick={() => onpick(r.id)}>
          <span class="ic mod"><ModCard mod={r.mod} scale={0.2} bare /></span>
          <span class="txt">
            <b>{r.mod.name}</b>
            <small>{r.mod.en}</small>
          </span>
          {#if inGoals}
            <span class="badge goal">{t("goal.pick.inGoals")}</span>
          {:else if have}
            <span class="badge">{t("goal.pick.modOwned")}</span>
          {:else}
            <span class="add">＋</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .picker {
    height: 100%;
  }
  .top {
    display: flex;
    align-items: flex-start;
    padding: 20px 22px 6px;
  }
  .title h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .title p {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--text-dim);
    max-width: 640px;
    line-height: 1.45;
  }
  .close {
    margin-left: auto;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    color: var(--text-faint);
  }
  .close:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 10px 22px 14px;
  }
  .controls > input {
    flex: 1 1 320px;
    padding: 12px 15px;
    border-radius: 12px;
    border: 1px solid var(--glass-line);
    background: var(--surface);
    font-size: 15px;
    outline: none;
  }
  .controls > input:focus {
    border-color: rgba(201, 166, 107, 0.55);
  }
  .seg button {
    font-size: 12.5px;
    padding: 6px 11px;
  }
  .seg i {
    font-style: normal;
    color: var(--text-faint);
    margin-left: 3px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 16px 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 6px;
  }
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px 9px 9px;
    border-radius: 12px;
    text-align: left;
    background: var(--surface);
    border: 1px solid transparent;
    transition: background 0.12s, border-color 0.12s;
  }
  .card:hover {
    background: var(--surface-2);
    border-color: rgba(201, 166, 107, 0.35);
  }
  .ic {
    flex: none;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.25);
  }
  .ic.mod {
    width: 60px;
    background: none;
  }
  .card.prime .ic {
    box-shadow: inset 0 0 0 1px rgba(201, 166, 107, 0.35);
  }
  .ic img {
    width: 42px;
    height: 42px;
    object-fit: contain;
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  .txt b {
    display: block;
    font-weight: 500;
    font-size: 14px;
  }
  .txt small {
    display: block;
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card.owned .txt b {
    color: var(--text-dim);
  }
  .badge {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--text-dim);
    background: var(--surface-2);
    white-space: nowrap;
  }
  .badge.max {
    color: var(--good);
    background: rgba(111, 207, 151, 0.12);
  }
  .badge.goal {
    color: var(--accent);
    background: var(--accent-soft);
  }
  .hide {
    display: flex;
    white-space: nowrap;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .hide input {
    accent-color: var(--accent);
  }
  .add {
    flex: none;
    color: var(--text-faint);
    font-size: 16px;
  }
  .card:hover .add {
    color: var(--accent);
  }
</style>
