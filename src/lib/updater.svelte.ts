// App updates (main window): tauri-plugin-updater reads latest.json from the public releases repo
// (GitHub Releases, scripts/release.mjs), checks the signature, installs passively and restarts.
// Checked at start and every 6 hours unless turned off (Settings); a found version shows the banner
// (UpdateBanner.svelte) and one Windows notification per version (the window may sit in the tray).
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { t } from "$lib/i18n/index.svelte";

const KEY = "dwc.update";
const EVERY = 6 * 3600_000;
const FIRST = 15_000; // after start: let the app load first

type Status = "idle" | "checking" | "none" | "available" | "downloading" | "error";

interface Saved {
  auto: boolean;
  told?: string; // the version the Windows notification was sent for
}

function read(): Saved {
  try {
    return { auto: true, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { auto: true };
  }
}

class Updater {
  saved = $state<Saved>(read());
  status = $state<Status>("idle");
  current = $state("");
  version = $state("");
  notes = $state("");
  progress = $state(0); // 0..1, while downloading
  error = $state("");
  hidden = $state(false); // «Позже»: until the next check finds it again
  checkedAt = $state(0);
  #update: Update | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  #save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      // storage unavailable
    }
  }

  setAuto(on: boolean) {
    this.saved = { ...this.saved, auto: on };
    this.#save();
    this.#schedule();
  }

  start() {
    getVersion().then((v) => (this.current = v)).catch(() => {});
    // A dev build would "update" itself into the installed release.
    if (import.meta.env.DEV) return;
    setTimeout(() => this.saved.auto && this.check(), FIRST);
    this.#schedule();
  }

  #schedule() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.saved.auto && !import.meta.env.DEV) this.#timer = setInterval(() => this.check(), EVERY);
  }

  async check(manual = false) {
    if (this.status === "checking" || this.status === "downloading") return;
    this.status = "checking";
    this.error = "";
    try {
      const u = await check();
      this.checkedAt = Date.now();
      this.#update = u;
      if (!u) {
        this.status = "none";
        return;
      }
      this.version = u.version;
      this.notes = (u.body ?? "").trim();
      this.status = "available";
      this.hidden = false;
      if (!manual) this.#notify(u.version);
    } catch (e) {
      this.status = "error";
      this.error = String(e);
    }
  }

  async #notify(v: string) {
    if (this.saved.told === v) return;
    this.saved = { ...this.saved, told: v };
    this.#save();
    try {
      if (await isPermissionGranted()) sendNotification({ title: t("upd.notifyTitle"), body: t("upd.notifyBody", { v }) });
    } catch {
      // notifications unavailable
    }
  }

  later() {
    this.hidden = true;
  }

  // Download, check the signature, run the installer (passive), restart into the new version.
  async install() {
    const u = this.#update;
    if (!u || this.status === "downloading") return;
    this.status = "downloading";
    this.progress = 0;
    this.error = "";
    let total = 0;
    let got = 0;
    try {
      await u.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          this.progress = total ? got / total : 0;
        } else if (e.event === "Finished") this.progress = 1;
      });
      await relaunch();
    } catch (e) {
      this.status = "error";
      this.error = String(e);
    }
  }
}

export const updater = new Updater();
