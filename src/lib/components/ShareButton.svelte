<script lang="ts">
  // «Поделиться»: the build's code to the clipboard (share.ts), «Скопировано» for a moment.
  import { t } from "$lib/i18n/index.svelte";
  import { copyText } from "$lib/whisper";
  import { encodeBuild, type Shared } from "$lib/share";

  let { get }: { get: () => Shared | null } = $props();

  let done = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function share() {
    const x = get();
    if (!x) return;
    const ok = await copyText(await encodeBuild(x));
    if (!ok) return;
    done = true;
    clearTimeout(timer);
    timer = setTimeout(() => (done = false), 1800);
  }
</script>

<button class="share" class:done onclick={share} title={t("share.hint")}>{done ? `✓ ${t("share.copied")}` : t("share.btn")}</button>

<style>
  .share {
    padding: 6px 12px;
    border-radius: 9px;
    border: 1px solid var(--line);
    font-size: 12.5px;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .share:hover {
    color: var(--text);
    border-color: var(--text-faint);
  }
  .done,
  .done:hover {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, transparent);
  }
</style>
