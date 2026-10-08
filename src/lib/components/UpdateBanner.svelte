<script lang="ts">
  // A new version found (updater.svelte.ts): what's new, «Обновить» / «Позже»; progress while downloading.
  import { num, t } from "$lib/i18n/index.svelte";
  import { updater } from "$lib/updater.svelte";

  const show = $derived(
    (updater.status === "available" && !updater.hidden) || updater.status === "downloading" || (updater.status === "error" && !!updater.version && !updater.hidden),
  );
</script>

{#if show}
  <div class="upd panel" role="status">
    <div class="head">
      <b>{t("upd.title", { v: updater.version })}</b>
      {#if updater.current}<small>{t("upd.from", { v: updater.current })}</small>{/if}
    </div>
    {#if updater.notes}<p class="notes">{updater.notes}</p>{/if}
    {#if updater.status === "downloading"}
      <div class="bar"><i style="width: {Math.round(updater.progress * 100)}%"></i></div>
      <small class="muted">{updater.progress >= 1 ? t("upd.installing") : t("upd.downloading", { p: num(Math.round(updater.progress * 100)) })}</small>
    {:else}
      {#if updater.status === "error"}<p class="err">{t("upd.failed")}</p>{/if}
      <div class="btns">
        <button class="primary" onclick={() => updater.install()}>{t("upd.install")}</button>
        <button onclick={() => updater.later()}>{t("upd.later")}</button>
      </div>
      <small class="muted">{t("upd.restartHint")}</small>
    {/if}
  </div>
{/if}

<style>
  .upd {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 50;
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border: 1px solid var(--accent);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head small,
  .muted {
    color: var(--text-faint);
    font-size: 11.5px;
  }
  .notes {
    margin: 0;
    max-height: 160px;
    overflow: auto;
    white-space: pre-wrap;
    font-size: 12.5px;
    color: var(--text-dim);
  }
  .btns {
    display: flex;
    gap: 8px;
  }
  .btns button {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .btns .primary {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--text);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
  .err {
    margin: 0;
    color: var(--warn);
    font-size: 12.5px;
  }
</style>
