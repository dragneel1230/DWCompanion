// Where the player is, from EE.log (reward.rs: "mission_state" command, "mission-state" event), for the
// main window's sections («Сейчас», «Добыча»). The hub keeps its own copy (it also learns the game window).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Mission } from "$lib/hub/hub";

class MissionState {
  value = $state<Mission | null>(null);
  #started = false;

  start() {
    if (this.#started) return;
    this.#started = true;
    invoke<Mission>("mission_state").then((m) => (this.value = m)).catch(() => {});
    listen<Mission>("mission-state", (e) => (this.value = e.payload));
  }
}

export const missionState = new MissionState();
