<script lang="ts">
  // The warning before enabling inventory reading: "Yes" unlocks after 10 s (DESIGN §2E).
  // No download — the app reads the game session itself (inv_session.rs). Used by the inventory head and settings.
  import { t } from "$lib/i18n/index.svelte";
  import { inventory } from "$lib/inventory.svelte";

  let { open = $bindable(false), ondone }: { open?: boolean; ondone?: () => void } = $props();

  const WAIT = 10; // seconds before "Yes" unlocks
  let left = $state(WAIT);

  $effect(() => {
    if (!open) return;
    left = WAIT;
    const id = setInterval(() => {
      left = Math.max(0, left - 1);
      if (!left) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  });

  function enable() {
    inventory.setRisk(true);
    open = false;
    ondone?.();
  }
</script>

{#if open}
  <div class="shade" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = false)}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="inv-ask">
      <h2 id="inv-ask">{t("inv.ask.title")}</h2>
      <ul>
        <li>{t("inv.ask.what")}</li>
        <li>{t("inv.ask.how")}</li>
        <li><b>{t("inv.ask.risk")}</b></li>
        <li>{t("inv.ask.app")}</li>
      </ul>
      <div class="actions">
        <button class="btn ghost" onclick={() => (open = false)}>{t("common.cancel")}</button>
        <button class="btn danger" onclick={enable} disabled={left > 0}>
          {left > 0 ? t("inv.ask.yesIn", { v: left }) : t("inv.ask.yes")}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shade {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(5, 6, 9, 0.65);
    backdrop-filter: blur(3px);
  }
  .modal {
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 22px;
    border-radius: 16px;
    border: 1px solid rgba(232, 160, 80, 0.35);
    background: var(--pop-bg, rgb(22, 25, 32));
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  }
  h2 {
    margin: 0;
    font-size: 18px;
    color: var(--warn);
  }
  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .btn {
    padding: 8px 16px;
    border-radius: 9px;
    background: var(--accent);
    color: #111;
    font-weight: 600;
    font-size: 13px;
  }
  .btn.ghost {
    background: none;
    color: var(--text);
    border: 1px solid var(--line);
    font-weight: 400;
  }
  .btn.danger {
    background: var(--warn);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
