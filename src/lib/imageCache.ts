// Keeps every loaded remote image alive for the window's lifetime. Switching tabs unmounts lists and
// their <img>s; without a live reference WebView may drop the decoded image and the next mount waits
// on the network/disk cache again (icons pop in one by one). An image the document still holds is
// served synchronously from its list of available images.
const MAX = 3000;
const kept = new Map<string, HTMLImageElement>();

function keep(src: string) {
  if (!src.startsWith("http") || kept.has(src)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  kept.set(src, img);
  if (kept.size > MAX) kept.delete(kept.keys().next().value!);
}

let started = false;
export function startImageCache() {
  if (started) return;
  started = true;
  // `load` doesn't bubble; a capturing listener on the document sees every <img> in the window.
  document.addEventListener(
    "load",
    (e) => {
      if (e.target instanceof HTMLImageElement) keep(e.target.currentSrc || e.target.src);
    },
    true,
  );
}
