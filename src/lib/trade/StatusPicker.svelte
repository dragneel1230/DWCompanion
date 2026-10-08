<script lang="ts">
  // Status on warframe.market, like the site's menu: in game / online / invisible, "keep for" a time
  // (then offline), or "by the game": in game while Warframe is running. The socket lives in Rust.
  import { t, labels } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { wfmStatus, type WfmStatus } from "$lib/wfm.svelte";

  let open = $state(false);
  let minutes = $state<number | null>(null);
  let now = $state(Date.now());
  const clock = setInterval(() => (now = Date.now()), 15_000);
  onDestroy(() => clearInterval(clock));

  const NAME = labels({ ingame: "trade.st.ingame", online: "trade.st.online", invisible: "trade.st.invisible", offline: "trade.st.offline" });
  const HINT = labels({ ingame: "trade.st.ingameHint", online: "trade.st.onlineHint", invisible: "trade.st.invisibleHint", offline: "trade.st.offline" });
  const KEEP: { m: number | null; label: string }[] = $derived([
    { m: null, label: t("trade.keep.app") },
    { m: 30, label: t("trade.keep.min", { n: 30 }) },
    { m: 60, label: t("trade.keep.h", { n: 1 }) },
    { m: 120, label: t("trade.keep.h", { n: 2 }) },
    { m: 240, label: t("trade.keep.h", { n: 4 }) },
  ]);

  const i = $derived(wfmStatus.info);
  // What the site shows: the confirmed status, else what we are about to set, else offline.
  const shown = $derived(((i.connected && (i.status ?? i.want)) || "offline") as WfmStatus | "offline");
  const left = $derived(i.until ? Math.max(0, Math.ceil((i.until - now) / 60_000)) : null);
  const leftText = $derived(left == null ? "" : left >= 60 ? t("trade.left.h", { h: Math.floor(left / 60), m: left % 60 }) : t("trade.left.m", { m: left }));

  function pick(s: WfmStatus) {
    void wfmStatus.set(s, s === "invisible" ? null : minutes);
    open = false;
  }
  function toggleAuto() {
    void wfmStatus.auto(!i.auto);
  }
  function onwin(e: MouseEvent) {
    if (open && !(e.target as Element).closest(".status")) open = false;
  }
</script>

<svelte:window onclick={onwin} onkeydown={(e) => e.key === "Escape" && (open = false)} />

<div class="status">
  <button class="pill {shown}" onclick={() => (open = !open)} title={HINT[shown]}>
    <span class="dot"></span>
    <span class="name">{NAME[shown]}</span>
    {#if i.auto}<span class="meta">{t("trade.st.auto")}</span>{:else if leftText}<span class="meta">{leftText}</span>{/if}
    <svg viewBox="0 0 24 24" class="chev"><path d="m6 9 6 6 6-6" /></svg>
  </button>

  {#if open}
    <div class="pop">
      <div class="lbl">{t("trade.st.set")}</div>
      {#each ["ingame", "online", "invisible"] as const as s}
        <button class="opt {s}" class:on={!i.auto && i.want === s} onclick={() => pick(s)}>
          <span class="dot"></span>
          <span class="txt"><b>{NAME[s]}</b><small>{HINT[s]}</small></span>
        </button>
      {/each}

      <div class="lbl">{t("trade.keep")}</div>
      <div class="chips">
        {#each KEEP as k}
          <button class:on={minutes === k.m} onclick={() => (minutes = k.m)}>{k.label}</button>
        {/each}
      </div>
      <p class="note">{minutes == null ? t("trade.keep.appHint") : t("trade.keep.timedHint")}</p>

      <div class="sep"></div>
      <button class="auto" class:on={i.auto} onclick={toggleAuto}>
        <span class="switch"><span></span></span>
        <span class="txt"><b>{t("trade.st.byGame")}</b><small>{t("trade.st.byGameHint")}</small></span>
      </button>
      {#if i.auto}
        <p class="note">{i.game ? t("trade.st.gameOn") : t("trade.st.gameOff")}</p>
      {/if}
      {#if wfmStatus.error}<p class="note err">{wfmStatus.error}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .status {
    position: relative;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px 7px 11px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .pill:hover {
    background: var(--surface-2);
  }
  .meta {
    color: var(--text-faint);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .chev {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 2;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: var(--text-faint);
  }
  .ingame .dot {
    background: #a78bfa;
    box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.18);
  }
  .online .dot {
    background: var(--good);
    box-shadow: 0 0 0 3px rgba(111, 207, 151, 0.18);
  }
  .invisible .dot {
    background: transparent;
    border: 1.5px solid var(--text-dim);
  }
  .pop {
    position: absolute;
    z-index: 20;
    right: 0;
    top: calc(100% + 6px);
    width: 300px;
    padding: 10px;
    border-radius: 12px;
    background: var(--pop-bg);
    border: 1px solid var(--line);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  }
  .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin: 4px 4px 6px;
  }
  .opt,
  .auto {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    border-radius: 8px;
    text-align: left;
  }
  .opt:hover,
  .auto:hover {
    background: var(--surface);
  }
  .opt.on {
    background: var(--surface);
    outline: 1px solid var(--line);
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .txt b {
    font-weight: 500;
    font-size: 13px;
  }
  .txt small {
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 4px;
  }
  .chips button {
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--text-dim);
    border: 1px solid var(--line);
  }
  .chips button.on {
    color: var(--text);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .note {
    margin: 6px 4px 2px;
    font-size: 11.5px;
    color: var(--text-faint);
    line-height: 1.4;
  }
  .note.err {
    color: var(--warn);
  }
  .sep {
    height: 1px;
    background: var(--line);
    margin: 10px 0 6px;
  }
  .switch {
    flex: none;
    width: 30px;
    height: 17px;
    border-radius: 999px;
    background: var(--line);
    position: relative;
    transition: background 0.15s;
  }
  .switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--text-dim);
    transition: transform 0.15s;
  }
  .auto.on .switch {
    background: var(--accent);
  }
  .auto.on .switch span {
    transform: translateX(13px);
    background: #1a1408;
  }
</style>
