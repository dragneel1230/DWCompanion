<script lang="ts">
  // «Сейчас»: the hub's first tab in the app window (src/lib/views/NowView). ?time — every timer
  // (Time.svelte), ?baro — Baro's goods; both open over it, "Назад" returns.
  import { t } from "$lib/i18n/index.svelte";
  import { onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { invoke } from "@tauri-apps/api/core";
  import { appPath, type View } from "$lib/hub/hub";
  import { watchWorld } from "$lib/hub/worldData.svelte";
  import { overlaySettings } from "$lib/overlaySettings.svelte";
  import { missionState } from "$lib/missionState.svelte";
  import NowView from "$lib/views/NowView.svelte";
  import Time from "$lib/hub/Time.svelte";
  import Baro from "$lib/hub/Baro.svelte";

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 1000);
  watchWorld(true);
  missionState.start();
  const mission = $derived(missionState.value);
  onDestroy(() => {
    clearInterval(tick);
    watchWorld(false);
  });

  const baro = $derived(page.url.searchParams.has("baro"));
  const time = $derived(page.url.searchParams.has("time"));
  const open = (v: View) => goto(appPath(v));
  // Is the Warframe window open: checked now and every 10 s while the page is shown.
  let game = $state(false);
  const checkGame = () => invoke<boolean>("game_window_open").then((g) => (game = g)).catch(() => {});
  checkGame();
  const gameTick = setInterval(checkGame, 10_000);
  onDestroy(() => clearInterval(gameTick));
</script>

{#if baro}
  <div class="page wide full">
    <Baro {now} onopen={open} onback={() => history.back()} />
  </div>
{:else if time}
  <div class="page wide">
    <div class="head">
      <button class="back" onclick={() => history.back()}>← {t("common.back")}</button>
      <h1>{t("time.title")}</h1>
    </div>
    <Time {now} onopen={open} />
    <p class="hint">{t("timepage.hint")}</p>
  </div>
{:else}
  <div class="page wide full">
    <h1>{t("nav.now")}</h1>
    <div class="grow"><NowView {mission} {game} priority={overlaySettings.value.priority} {now} onopen={open} /></div>
  </div>
{/if}

<style>
  .wide {
    max-width: 1400px;
  }
  .full {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .full > :global(.panel),
  .grow {
    flex: 1;
    min-height: 560px;
  }
  h1 {
    font-size: 26px;
    font-weight: 600;
    margin: 0 0 18px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .back {
    font-size: 13px;
    color: var(--text-dim);
  }
  .back:hover {
    color: var(--accent);
  }
  .hint {
    margin: 18px 4px 0;
    font-size: 12px;
    color: var(--text-faint);
  }
</style>
