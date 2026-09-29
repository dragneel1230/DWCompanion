<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { invoke } from "@tauri-apps/api/core";
  import { loadDb } from "$lib/db";
  import { allRewards } from "$lib/rewards";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { overlaySettings } from "$lib/overlaySettings.svelte";

  let { children } = $props();

  let ready = $state(false);
  let error = $state("");
  let paletteOpen = $state(false);

  loadDb()
    .then(() => {
      ready = true;
      // The reward scanner checks card text against these (skips countdowns and other text).
      if (!bare) invoke("reward_names", { names: allRewards().map((c) => c.name) }).catch(() => {});
    })
    .catch((e) => (error = String(e)));

  function onkeydown(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && ev.code === "KeyK") {
      paletteOpen = !paletteOpen;
      ev.preventDefault();
    } else if (ev.key === "Escape" && paletteOpen) {
      paletteOpen = false;
    }
  }

  const NAV = [
    { href: "/", label: "Поиск", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3" },
    { href: "/frames", label: "Варфреймы", icon: "M12 3 5 7v6c0 4 3 7 7 8 4-1 7-4 7-8V7l-7-4Zm0 5v8" },
    // Inventory (mod scan, /inventory) is hidden: too much manual work, waiting for DE (docs/DE_REQUEST.md).
    { href: "/fissures", label: "Разломы", icon: "M12 3v18M5 7l14 10M19 7 5 17" },
    { href: "/time", label: "Время", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2" },
    { href: "/overlay-settings", label: "Оверлей", icon: "M4 6h16v9H4zM8 19h8M12 15v4" },
  ];

  // Frame and build pages belong to the Warframes tab.
  const SECTION: Record<string, string> = { "/frame": "/frames", "/build": "/frames", "/market": "/frames" };
  const current = $derived(SECTION[page.url.pathname] ?? page.url.pathname);
  // The overlay window (over the game) renders its page alone, without the app shell.
  const bare = page.url.pathname === "/overlay";
  // Saved overlay settings reach the Rust side once, from the main window.
  if (!bare) overlaySettings.sync();
</script>

<svelte:window {onkeydown} />

{#if bare}
  {#if ready}{@render children()}{/if}
{:else}
<div class="shell">
  <nav>
    <div class="logo" title="Dragneel's Warframe Companion">DW</div>
    {#each NAV as n}
      <a href={n.href} class:current={current === n.href} title={n.label}>
        <svg viewBox="0 0 24 24"><path d={n.icon} /></svg>
        <span>{n.label}</span>
      </a>
    {/each}
    <button class="palette-btn" onclick={() => (paletteOpen = true)} title="Быстрый поиск (Ctrl+K)">Ctrl K</button>
  </nav>

  <main>
    {#if error}
      <div class="page"><p>Не удалось загрузить базу: {error}</p></div>
    {:else if ready}
      {@render children()}
    {/if}
  </main>
</div>

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
    width: 76px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 0;
    border-right: 1px solid var(--line);
    background: var(--bg);
  }
  .logo {
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 14px;
  }
  nav a {
    width: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    border-radius: 10px;
    color: var(--text-faint);
    font-size: 11px;
  }
  nav a:hover {
    color: var(--text-dim);
  }
  nav a.current {
    color: var(--text);
    background: var(--surface);
  }
  nav svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .palette-btn {
    margin-top: auto;
    font-size: 10px;
    color: var(--text-faint);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 6px;
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
    width: min(640px, 92vw);
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  }
</style>
