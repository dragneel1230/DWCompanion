// The game client's language, read from EE.log by the Rust side (reward.rs track_lang): the reward cards
// on screen are written in it. Not the interface language: a Russian player may run the English client.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const client = $state({ lang: "ru" });

invoke<string>("client_lang")
  .then((l) => (client.lang = l))
  .catch(() => {});
listen<string>("client-lang", (e) => (client.lang = e.payload)).catch(() => {});
