<script lang="ts">
  // Goals list + the chosen goal's guide (or the picker). Shared by the app's "Цели" page and the hub tab.
  // `onnav`: where a link inside goes (the hub opens it in the app window instead of navigating itself).
  // `scroller`: the element that scrolls, brought back to the top when another goal opens.
  import { t } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { iconUrl } from "$lib/db";
  import { loadDrops, type DropsDb } from "$lib/drops";
  import { loadCraft, type CraftDb } from "$lib/craft";
  import { journal } from "$lib/journal.svelte";
  import { profile } from "$lib/profile.svelte";
  import { watchWorld } from "$lib/hub/worldData.svelte";
  import { loadFrames, loadOtherMods, type Mod } from "$lib/frames";
  import ModCard from "$lib/components/ModCard.svelte";
  import { makePlan, type Plan } from "./plan";
  import { goals, progress, type Facts, type Goal } from "./goals.svelte";
  import { modProgress } from "./modGoal";
  import ModGuide from "./ModGuide.svelte";
  import { needs } from "./watch.svelte";
  import GoalPicker from "./GoalPicker.svelte";
  import Guide from "./Guide.svelte";

  let {
    add: addId = null,
    onnav,
    scroller = "main",
    compact = false,
  }: { add?: string | null; onnav?: (href: string) => void; scroller?: string; compact?: boolean } = $props();

  let drops = $state<DropsDb | null>(null);
  let craft = $state<CraftDb | null>(null);
  let error = $state("");
  Promise.all([loadDrops(), loadCraft()])
    .then(([d, c]) => ((drops = d), (craft = c)))
    .catch((e) => (error = String(e)));
  // Every mod (warframe ones and the rest): goals can be mods too.
  let mods = $state<Record<string, Mod> | null>(null);
  Promise.all([loadFrames(), loadOtherMods().catch(() => ({}))])
    .then(([f, o]) => (mods = { ...o, ...f.mods }))
    .catch(() => (mods = {}));

  journal.start();
  profile.start();
  watchWorld(true);
  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  onDestroy(() => {
    clearInterval(tick);
    watchWorld(false);
  });

  let picking = $state(false);

  // Added from another page (`?add=`): take it once the data is in.
  $effect(() => {
    if (!addId || !craft || !mods) return;
    if (craft.items[addId] || mods[addId]) goals.add(addId);
    picking = false;
  });

  const facts = $derived<Facts>({ journal: journal.list, profile: profile.data });
  // A goal is a craft item (plan) or a mod.
  type Row = { g: Goal; name: string; icon: string | null; p?: Plan; mod?: Mod; pr: { done: number; total: number; next: unknown } };
  const plans = $derived(
    craft && drops
      ? goals.list.flatMap((g): Row[] => {
          const p = makePlan(craft!, drops!, g.id);
          if (p) return [{ g, name: p.item.name, icon: p.item.icon, p, pr: progress(g, p, facts) }];
          const m = mods?.[g.id];
          return m ? [{ g, name: m.name, icon: m.icon, mod: m, pr: modProgress(g, g.id, m) }] : [];
        })
      : [],
  );
  const current = $derived(plans.find((x) => x.g.id === goals.active) ?? null);
  const showPicker = $derived(picking || !goals.list.length);

  const top = () => document.querySelector(scroller)?.scrollTo({ top: 0 });
  function add(id: string) {
    goals.add(id);
    picking = false;
    top();
  }
  function select(id: string) {
    goals.open(id);
    picking = false;
    top();
  }
  // Removing asks in place (the row turns into "Убрать цель? Да / Нет"), no browser dialog.
  let removing = $state<string | null>(null);
  function remove(id: string) {
    goals.remove(id);
    removing = null;
  }
  // Esc in the hub: closes the picker first.
  export function dismiss(): boolean {
    if (!picking || !goals.list.length) return false;
    picking = false;
    return true;
  }
</script>

{#if error}
  <p class="muted">{t("app.dbError", { error })}</p>
{:else if !drops || !craft}
  <p class="muted">{t("common.loading")}</p>
{:else}
  <div class="layout" class:solo={!goals.list.length} class:compact>
    {#if goals.list.length}
      <aside class="panel list">
        <div class="list-head">
          <h2>{t("goal.mine")}</h2>
          <button class="add" class:on={showPicker} onclick={() => (picking = !picking)}>＋ {t("goal.new")}</button>
        </div>
        <div class="items">
          {#each plans as { g, name, icon, mod, pr } (g.id)}
            {@const share = pr.total ? pr.done / pr.total : 0}
            <div class="goal" class:on={!showPicker && goals.active === g.id} class:asking={removing === g.id}>
              {#if removing === g.id}
                <div class="ask">
                  <span>{t("goal.removeAsk")}</span>
                  <small>{t("goal.removeAskHint")}</small>
                  <div class="ask-btns">
                    <button class="yes" onclick={() => remove(g.id)}>{t("goal.removeYes")}</button>
                    <button class="no" onclick={() => (removing = null)}>{t("goal.removeNo")}</button>
                  </div>
                </div>
              {:else}
              <button class="pick" onclick={() => select(g.id)}>
                <span class="ic" class:mod>{#if mod}<ModCard {mod} scale={0.14} bare />{:else if icon}<img src={iconUrl(icon)} alt="" loading="lazy" />{/if}</span>
                <span class="txt">
                  <b>{name}</b>
                  <small>{pr.next ? t("goal.list.next", { done: pr.done, total: pr.total }) : t("goal.list.done")}</small>
                  <span class="bar"><span style:width="{share * 100}%" class:full={!pr.next}></span></span>
                </span>
              </button>
              <button class="x" title={t("goal.remove")} onclick={() => (removing = g.id)}>✕</button>
              {/if}
            </div>
          {/each}
        </div>
        <label class="notify" title={t("goal.notify.hint")}>
          <input type="checkbox" checked={needs.notify} onchange={(e) => needs.setNotify(e.currentTarget.checked)} />
          <span>{t("goal.notify.toggle")}</span>
        </label>
      </aside>
    {/if}

    <div class="main">
      {#if showPicker}
        <GoalPicker {drops} {craft} {mods} onpick={add} oncancel={goals.list.length ? () => (picking = false) : undefined} />
      {:else if current}
        {#key current.g.id}
          {#if current.p}
            <Guide plan={current.p} goal={current.g} {drops} {facts} {now} onadd={add} {onnav} />
          {:else if current.mod}
            <ModGuide id={current.g.id} mod={current.mod} goal={current.g} {drops} {onnav} />
          {/if}
        {/key}
      {/if}
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-columns: 290px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .layout.solo {
    grid-template-columns: minmax(0, 1fr);
  }
  .list {
    position: sticky;
    top: 16px;
    max-height: calc(100vh - 140px);
    padding: 14px 10px 10px;
  }
  .list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 10px;
  }
  .list-head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .add {
    padding: 5px 10px;
    border-radius: 9px;
    font-size: 12.5px;
    color: var(--accent);
    background: var(--accent-soft);
  }
  .add.on,
  .add:hover {
    background: rgba(201, 166, 107, 0.24);
  }
  .items {
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .goal {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 12px;
  }
  .goal:hover,
  .goal.on {
    background: var(--surface-2);
  }
  .goal.on {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px;
    text-align: left;
  }
  .ic {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
  }
  .ic img {
    max-width: 40px;
    max-height: 40px;
    object-fit: contain;
  }
  .txt {
    flex: 1;
    min-width: 0;
  }
  .txt b {
    display: block;
    font-weight: 500;
    font-size: 13.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .txt small {
    display: block;
    margin: 1px 0 5px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .bar {
    display: block;
    height: 3px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
  }
  .bar span.full {
    background: var(--good);
  }
  .x {
    flex: none;
    width: 26px;
    height: 26px;
    margin-right: 6px;
    border-radius: 8px;
    color: var(--text-faint);
    opacity: 0;
    font-size: 11px;
  }
  .goal:hover .x {
    opacity: 1;
  }
  .goal.asking {
    background: rgba(226, 112, 106, 0.08);
    box-shadow: inset 0 0 0 1px rgba(226, 112, 106, 0.3);
  }
  .ask {
    flex: 1;
    padding: 10px 12px;
  }
  .ask span {
    display: block;
    font-size: 13px;
    font-weight: 500;
  }
  .ask small {
    display: block;
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--text-faint);
  }
  .ask-btns {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .ask-btns button {
    padding: 5px 12px;
    border-radius: 8px;
    font-size: 12.5px;
  }
  .ask-btns .yes {
    background: rgba(226, 112, 106, 0.85);
    color: #1a0d0c;
    font-weight: 600;
  }
  .ask-btns .no {
    background: var(--surface-2);
  }
  .x:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--warn);
  }
  .main {
    min-width: 0;
  }
  /* In the hub the panel body scrolls: the list sticks to its top. */
  .compact .list {
    top: 0;
    max-height: calc(100vh - 260px);
  }
  .compact .main > :global(.picker) {
    height: calc(100vh - 300px);
  }
  .notify {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 6px 2px;
    padding-top: 10px;
    border-top: 1px solid var(--glass-line);
    font-size: 12px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .notify input {
    accent-color: var(--accent);
  }
  /* The picker scrolls inside itself (it loads more cards near the bottom). */
  .main > :global(.picker) {
    height: calc(100vh - 170px);
    min-height: 420px;
  }
</style>
