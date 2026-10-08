<script lang="ts">
  // Hub: the overlay opened by a hotkey over the game (hub.rs). Blurred frame of the game behind,
  // search on top, below it the same sections as the app (src/lib/views: «Сейчас», «Реликвии», «Торговля»…);
  // a search pick or a link inside a section opens the detail panel in place. Esc steps back, then
  // returns to the game.
  import { locale, t, type Key } from "$lib/i18n/index.svelte";
  import { onDestroy, tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type { Entry } from "$lib/db";
  import { readOverlaySettings, type Priority } from "$lib/overlaySettings.svelte";
  import { readHubSettings, shortcutKeys } from "$lib/hubSettings.svelte";
  import { appPath, viewOf, type Mission, type View } from "$lib/hub/hub";
  import { watchWorld } from "$lib/hub/worldData.svelte";
  import "$lib/hub/hub.css";
  import Search from "$lib/hub/Search.svelte";
  import NowView from "$lib/views/NowView.svelte";
  import TradeView from "$lib/views/TradeView.svelte";
  import RelicsView from "$lib/views/RelicsView.svelte";
  import BuildsView from "$lib/views/BuildsView.svelte";
  import { followSection } from "$lib/views/sub.svelte";
  import Detail from "$lib/hub/Detail.svelte";
  import Baro from "$lib/hub/Baro.svelte";
  import Collection from "$lib/collection/Collection.svelte";
  import FarmView from "$lib/views/FarmView.svelte";
  import { farmState } from "$lib/views/farmState.svelte";
  import Time from "$lib/hub/Time.svelte";
  import GoalsView from "$lib/goals/GoalsView.svelte";
  import { tabs, saveTabs, type HubTab } from "$lib/hub/tabState.svelte";

  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";

  let open = $state(false);
  let bg = $state<string | null>(null);
  let game = $state(false);
  let seq = 0; // open number from hub.rs: a background frame of an earlier open is ignored
  let mission = $state<Mission | null>(null);
  // Pages opened over each tab: switching tabs (or hiding the hub) keeps them.
  let stacks = $state<Partial<Record<HubTab, View[]>>>({});
  let query = $state("");
  let priority = $state<Priority>("platinum");
  let shortcut = $state<string[]>([]);
  let now = $state(Date.now());
  let search = $state<Search>();
  let collection = $state<Collection>();
  let farm = $state<FarmView>();
  let trade = $state<TradeView>();
  let goalsView = $state<GoalsView>();
  const tab = $derived(tabs.tab);
  const TABS: { id: HubTab; label: Key }[] = [
    { id: "now", label: "nav.now" },
    { id: "goals", label: "nav.goals" },
    { id: "builds", label: "nav.builds" },
    { id: "relics", label: "nav.relics" },
    { id: "trade", label: "nav.trade" },
    { id: "resources", label: "nav.resources" },
    { id: "collection", label: "nav.collection" },
  ];
  const stack = $derived(stacks[tabs.tab] ?? []);
  const setStack = (v: View[]) => (stacks[tabs.tab] = v);
  // Clicking the active tab again returns to its root.
  const setTab = (t: HubTab) => (t === tabs.tab ? setStack([]) : ((tabs.tab = t), saveTabs()));

  const view = $derived(stack.at(-1));

  let clock: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(clock);
    if (open) clock = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => clearInterval(clock));
  // Fissures and timers: cached copy shown at once, refreshed while open.
  $effect(() => watchWorld(open));
  onDestroy(() => watchWorld(false));

  invoke<Mission>("mission_state").then((m) => (mission = m)).catch(() => {});

  // A render error must not leave an invisible layer that eats the mouse: boundaries show a message,
  // and the next open starts clean.
  let resets: (() => void)[] = [];
  const failed = (e: unknown, reset: () => void) => {
    console.error("hub render error", e);
    resets.push(reset);
  };
  function recover() {
    const r = resets;
    if (!r.length) return;
    stacks = {};
    tabs.tab = "now";
    resets = [];
    r.forEach((f) => f());
  }

  type Opened = { seq: number; bg: string | null; game: boolean };
  async function onOpen(p: Opened) {
    // Open pages survive hide/show: look at an item, check the game, come back to it.
    recover();
    seq = p.seq;
    bg = p.bg; // with the game running the frame comes a moment later ("hub-bg")
    game = p.game;
    now = Date.now();
    // Settings are edited in the main window; localStorage is shared.
    priority = readOverlaySettings().priority;
    shortcut = shortcutKeys(readHubSettings().shortcut);
    open = true;
    await tick();
    search?.focus(true);
    // Timing of the open (hub.rs): the first frame drawn with the content.
    requestAnimationFrame(() => requestAnimationFrame(() => invoke("hub_painted").catch(() => {})));
  }

  const close = () => invoke("hub_hide");
  const openView = (v: View) => {
    setStack([...stack, v]);
    query = "";
  };
  const back = () => setStack(stack.slice(0, -1));
  const pick = (e: Entry) => (setStack([{ kind: e.kind, id: e.id }]), (query = ""));
  // From the collection: a set / warframe / part opens in the detail panel (warframe pages stay in the app).
  const fromCollection = (kind: "set" | "frame" | "item" | "relic", id: string) =>
    kind === "frame" ? invoke("hub_open_in_app", { path: `/frame?id=${encodeURIComponent(id)}` }) : openView({ kind, id });
  const openInApp = () => view && invoke("hub_open_in_app", { path: appPath(view) });

  // Sections are shared with the app and link to its pages: inside the hub a link opens the detail panel,
  // switches to the hub's own section, or (no such panel here) opens the page in the app.
  function onclick(ev: MouseEvent) {
    const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("/") || ev.defaultPrevented) return;
    ev.preventDefault();
    const section = followSection(href);
    if (section) {
      setStack([]);
      tabs.tab = section;
      saveTabs();
      return;
    }
    const v = viewOf(href);
    if (v) openView(v);
    else invoke("hub_open_in_app", { path: href });
  }

  function onkeydown(ev: KeyboardEvent) {
    if (!open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (search?.dismiss()) return;
      if (!stack.length && tab === "collection" && collection?.dismiss()) return;
      if (!stack.length && tab === "resources" && farm?.dismiss()) return;
      if (!stack.length && tab === "trade" && trade?.dismiss()) return;
      if (!stack.length && tab === "goals" && goalsView?.dismiss()) return;
      if (stack.length) back();
      else close();
    } else if ((ev.ctrlKey && ev.code === "KeyK") || ev.key === "/") {
      ev.preventDefault();
      search?.focus(true);
    } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !(ev.target instanceof HTMLInputElement)) {
      // Typing anywhere goes to the search.
      search?.focus();
    }
  }

  const un: Promise<UnlistenFn>[] = [
    listen<Opened>("hub-open", (e) => onOpen(e.payload)),
    listen<{ seq: number; bg: string }>("hub-bg", (e) => {
      if (e.payload.seq === seq && open) bg = e.payload.bg;
    }),
    listen("hub-close", () => (open = false)),
    listen<Mission>("mission-state", (e) => (mission = e.payload)),
  ];
  onDestroy(() => un.forEach((u) => u.then((f) => f())));

  const time = $derived(new Date(now).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }));
</script>

<!-- Capture phase: ahead of the SvelteKit router, which would load the app page inside the hub window. -->
<svelte:window {onkeydown} onclickcapture={onclick} />

<!-- Nothing is drawn while hidden, so the next open starts from a clean frame and animates in. -->
{#if open}
  <svelte:boundary onerror={failed}>
  <div class="hub">
    <div class="base"></div>
    {#if bg}<img class="bg" src={bg} alt="" />{/if}
    <div class="shade"></div>

    <div class="frame">
      <div class="top">
        <div class="brand"><b>DW</b><span>{t("hub.brand")}</span></div>
        <div class="seg tabs">
          {#each TABS as tb}
            <button class:on={tab === tb.id} onclick={() => setTab(tb.id)}>{t(tb.label)}</button>
          {/each}
        </div>
        <div class="clock">{time}</div>
      </div>

      <Search bind:this={search} bind:query onpick={pick} />

      <div class="main">
        <svelte:boundary onerror={failed}>
        {#if view}
          {#key view.kind + view.id}
            {#if view.kind === "baro"}
              <div class="swap"><Baro {now} onopen={openView} onback={back} /></div>
            {:else if view.kind === "time"}
              <div class="swap panel coll time-view">
                <header><button class="back" onclick={back}>← {t("common.back")}</button><h2>{t("time.title")}</h2></header>
                <div class="body"><Time {now} onopen={openView} /></div>
              </div>
            {:else}
              <div class="swap"><Detail {view} onopen={openView} onback={back} onapp={openInApp} /></div>
            {/if}
          {/key}
        {:else if tab === "goals"}
          <div class="swap panel coll goals-tab">
            <div class="body"><GoalsView bind:this={goalsView} compact scroller=".goals-tab .body" onnav={(path) => invoke("hub_open_in_app", { path })} /></div>
          </div>
        {:else if tab === "resources"}
          <div class="swap">
            <FarmView
              bind:this={farm}
              compact
              {mission}
              sel={farmState.stack.at(-1) ?? null}
              onselect={(s) => (farmState.stack = [...farmState.stack, s])}
              onback={() => (farmState.stack = farmState.stack.slice(0, -1))}
            />
          </div>
        {:else if tab === "builds"}
          <div class="swap panel coll"><div class="body"><BuildsView compact /></div></div>
        {:else if tab === "relics"}
          <div class="swap panel coll"><div class="body"><RelicsView compact /></div></div>
        {:else if tab === "trade"}
          <div class="swap panel coll"><div class="body"><TradeView bind:this={trade} compact onopen={openView} /></div></div>
        {:else if tab === "collection"}
          <div class="swap panel coll"><div class="body"><Collection bind:this={collection} onopen={fromCollection} compact ongoal={() => ((tabs.tab = "goals"), saveTabs(), setStack([]))} /></div></div>
        {:else}
          <NowView {mission} {game} {priority} {now} onopen={openView} />
        {/if}
          {#snippet failed(error)}
            <div class="panel crashed">
              <b>{t("hub.crashed")}</b>
              <span>{String((error as Error)?.message ?? error).slice(0, 200)}</span>
              <button onclick={recover}>{t("hub.backToOverview")}</button>
            </div>
          {/snippet}
        </svelte:boundary>
      </div>

      <div class="hints">
        <span><kbd>Esc</kbd>{view ? t("hub.hint.back") : t("hub.hint.toGame")}</span>
        <span><kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd>{t("hub.hint.pick")}</span>
        {#if shortcut.length}
          <span>{#each shortcut as k}<kbd>{k}</kbd>{/each}{t("hub.hint.toggle")}</span>
        {/if}
      </div>
    </div>
  </div>
    {#snippet failed(error)}
      <div class="hub fallback">
        <div class="panel crashed">
          <b>{t("hub.failed")}</b>
          <span>{String((error as Error)?.message ?? error).slice(0, 200)}</span>
          <button onclick={() => (recover(), close())}>{t("hub.closeEsc")}</button>
        </div>
      </div>
    {/snippet}
  </svelte:boundary>
{/if}

<style>
  :global(html),
  :global(body) {
    background: transparent !important;
    overflow: hidden;
  }
  .hub {
    position: fixed;
    inset: 0;
    overflow: hidden;
    user-select: none;
  }
  .hub :global(input) {
    user-select: text;
  }
  /* Darkening is instant (the answer to the hotkey); dark until the game frame arrives (hub.rs sends it right after the show), then the frame fades in.
     The frame is tiny and already blurred and saturated in hub.rs: the browser only stretches it,
     no CSS filter on a full-screen layer. */
  .base {
    position: absolute;
    inset: 0;
    background: rgba(6, 8, 12, 0.8);
  }
  .bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: fade 0.14s ease-out both;
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(6, 8, 12, 0.35), rgba(6, 8, 12, 0.75) 75%),
      rgba(6, 8, 12, 0.25);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  .frame {
    position: relative;
    height: 100%;
    width: min(1400px, calc(100% - 96px));
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 26px 0 18px;
    animation: rise 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-dim);
  }
  .tabs {
    margin-right: auto;
    margin-left: 22px;
  }
  .coll .body {
    padding: 18px 20px 20px;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .brand b {
    color: var(--accent);
    letter-spacing: 0.08em;
  }
  .brand span {
    font-size: 13px;
    color: var(--text-faint);
  }
  .clock {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  .main {
    flex: 1;
    min-height: 0;
    margin-top: 8px;
  }
  .time-view header {
    gap: 14px;
  }
  .back {
    font-size: 13px;
    color: var(--text-dim);
  }
  .back:hover {
    color: var(--accent);
  }
  .swap {
    height: 100%;
    animation: rise 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .swap :global(.detail .body) {
    overflow-y: auto;
  }

  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(6, 8, 12, 0.9);
  }
  .fallback .crashed {
    height: auto;
    padding: 28px 36px;
  }
  .crashed {
    height: 100%;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    color: var(--text-dim);
  }
  .crashed b {
    color: var(--text);
    font-size: 16px;
  }
  .crashed span {
    max-width: 640px;
    font-size: 12.5px;
    color: var(--text-faint);
  }
  .crashed button {
    margin-top: 6px;
    padding: 8px 16px;
    border-radius: 10px;
    background: var(--accent);
    color: #16120a;
    font-weight: 600;
  }
  .hints {
    display: flex;
    justify-content: center;
    gap: 26px;
    font-size: 12px;
    color: var(--text-faint);
  }
  .hints span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
</style>
