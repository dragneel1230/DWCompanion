<script lang="ts">
  import "../app.css";
  import "$lib/hub/hub.css"; // panels, rows, segments: shared by the hub and the app window
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { loadDb } from "$lib/db";
  import { loadBulk } from "$lib/api";
  import { startImageCache } from "$lib/imageCache";
  import { allRewards } from "$lib/rewards";
  import { client } from "$lib/clientLang.svelte";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { overlaySettings } from "$lib/overlaySettings.svelte";
  import { hubSettings } from "$lib/hubSettings.svelte";
  import { appSettings } from "$lib/appSettings.svelte";
  import { wfmStatus } from "$lib/wfm.svelte";
  import { startGoalWatch } from "$lib/goals/watch.svelte";
  import { startInventoryAuto } from "$lib/inventory.svelte";
  import { startNotifyWatch } from "$lib/notify/watch.svelte";
  import { updater } from "$lib/updater.svelte";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
  import { i18n, LANGS, t, type Key } from "$lib/i18n/index.svelte";

  let { children } = $props();

  startImageCache();

  let ready = $state(false);
  let error = $state("");
  let paletteOpen = $state(false);

  loadDb()
    .then(() => {
      ready = true;
      loadBulk(); // prime prices in one request, before any page asks
    })
    .catch((e) => (error = String(e)));

  // The reward scanner checks card text against these (skips countdowns and other text): names as the
  // game client shows them, sent again when the client's language changes (game restarted in another one).
  $effect(() => {
    if (!ready || bare) return;
    invoke("reward_names", { names: allRewards(client.lang).map((c) => c.name) }).catch(() => {});
  });

  function onkeydown(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && ev.code === "KeyK") {
      paletteOpen = !paletteOpen;
      ev.preventDefault();
    } else if (ev.key === "Escape" && paletteOpen) {
      paletteOpen = false;
    }
  }

  // Same sections as the hub's tabs, in the same order. Settings are the
  // gear at the bottom. Global search is Ctrl+K (the button at the bottom); the app opens on «Сейчас».
  const NAV: { href: string; label: Key; icon: string }[] = [
    { href: "/now", label: "nav.now", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2" },
    { href: "/goals", label: "nav.goals", icon: "M6 21V4M6 4h11l-2.5 4L17 12H6" },
    { href: "/frames", label: "nav.builds", icon: "M12 3 5 7v6c0 4 3 7 7 8 4-1 7-4 7-8V7l-7-4Zm0 5v8" },
    { href: "/relics", label: "nav.relics", icon: "M12 3 6 9l6 12 6-12-6-6ZM6 9h12" },
    { href: "/trade", label: "nav.trade", icon: "M4 7h16M4 12h16M4 17h10M18 15v6M15 18h6" },
    { href: "/resources", label: "nav.resources", icon: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5" },
    { href: "/ship", label: "nav.ship", icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3 12h3M18 12h3" },
    { href: "/collection", label: "nav.collection", icon: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l7-7" },
  ];
  const GEAR =
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z";

  // Item pages belong to the section they were opened from most often.
  const SECTION: Record<string, string> = { "/frame": "/frames", "/build": "/frames", "/gear": "/frames", "/market": "/trade", "/set": "/trade", "/item": "/trade", "/relic": "/relics" };
  const current = $derived(SECTION[page.url.pathname] ?? page.url.pathname);
  // Windows over the game (reward overlay, hub) render their page alone, without the app shell.
  const bare = page.url.pathname === "/overlay" || page.url.pathname === "/hub";
  // Saved settings reach the Rust side once, from the main window.
  if (!bare) {
    overlaySettings.sync();
    hubSettings.sync();
    appSettings.sync();
    wfmStatus.restore();
    // Goals: what the overlay / hub / journal mark as needed, fissure notifications.
    loadDb().then(startGoalWatch).catch(() => {});
    // Notification filters and the foundry's "ready" (Settings → «Уведомления»).
    loadDb().then(startNotifyWatch).catch(() => {});
    // Inventory refresh after missions, when the player turned it on.
    startInventoryAuto();
    // App updates from GitHub Releases (updater.svelte.ts).
    updater.start();
    // "Открыть в приложении" in the hub.
    listen<string>("navigate", (e) => goto(e.payload));
  }
</script>

<svelte:window {onkeydown} />

{#if bare}
  {#if ready}{@render children()}{/if}
{:else}
<div class="shell app">
  <nav>
    <div class="logo" title="Dragneel's Warframe Companion">DW</div>
    {#each NAV as n}
      <a href={n.href} class:current={current === n.href} title={t(n.label)}>
        <svg viewBox="0 0 24 24"><path d={n.icon} /></svg>
        <span>{t(n.label)}</span>
      </a>
    {/each}
    <a class="gear" href="/settings" class:current={current === "/settings"} title={t("nav.settings")}>
      <svg viewBox="0 0 24 24"><path d={GEAR} /></svg>
    </a>
    <!-- Interface language: remembered (localStorage), the hub and the reward overlay follow it. -->
    <div class="lang" role="group" aria-label={t("nav.language")}>
      {#each LANGS as l}
        <button class:on={i18n.lang === l.id} onclick={() => i18n.set(l.id)} title={l.label}>{l.id.toUpperCase()}</button>
      {/each}
    </div>
    <button class="palette-btn" onclick={() => (paletteOpen = true)} title={t("nav.quickSearch")}>Ctrl K</button>
  </nav>

  <main>
    {#if error}
      <div class="page"><p>{t("app.dbError", { error })}</p></div>
    {:else if ready}
      {@render children()}
    {/if}
  </main>
</div>

<UpdateBanner />

{#if paletteOpen && ready}
  <div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (paletteOpen = false)}>
    <div class="palette">
      <SearchBox autofocus onpick={() => (paletteOpen = false)} />
    </div>
  </div>
{/if}
{/if}

<style>
  .shell {
    display: flex;
    height: 100vh;
  }
  nav {
    width: 80px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 0 14px;
    border-right: 1px solid var(--glass-line);
    background: rgba(6, 8, 12, 0.5);
  }
  .logo {
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: 16px;
  }
  nav a {
    position: relative;
    width: 64px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 0 8px;
    border-radius: 12px;
    color: var(--text-faint);
    font-size: 11px;
    transition: color 0.12s, background 0.12s;
  }
  nav a:hover {
    color: var(--text-dim);
    background: var(--surface);
  }
  nav a.current {
    color: var(--text);
    background: var(--surface-2);
  }
  /* Current section: a short gold mark on the rail edge. */
  nav a.current::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 50%;
    width: 3px;
    height: 20px;
    margin-top: -10px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
    box-shadow: 0 0 10px rgba(201, 166, 107, 0.5);
  }
  nav a.current svg {
    stroke: var(--accent);
  }
  nav svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  nav a.gear {
    margin-top: auto;
    padding: 8px 0;
  }
  .lang {
    margin-top: 6px;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--surface);
  }
  .lang button {
    padding: 3px 7px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-faint);
  }
  .lang button.on {
    background: var(--surface-2);
    color: var(--text);
  }
  .palette-btn {
    margin-top: 8px;
    font-size: 10px;
    color: var(--text-faint);
    border: 1px solid var(--glass-line);
    border-bottom-width: 2px;
    border-radius: 7px;
    padding: 3px 7px;
  }
  .palette-btn:hover {
    color: var(--text-dim);
  }
  main {
    flex: 1;
    overflow-y: auto;
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 6, 9, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    z-index: 10;
  }
  .palette {
    width: min(680px, 92vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: rgba(14, 16, 22, 0.96);
    border: 1px solid var(--glass-line);
    border-radius: 18px;
    padding: 10px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
    animation: rise 0.16s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }
  }
</style>
