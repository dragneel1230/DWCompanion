// Fuzzy text comparison for OCR results.

// Lowercase, ё→е, letters and digits only (any alphabet): OCR mixes up ":" "." and spaces.
export const compact = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");

// Edit distance.
export function lev(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Edit distance of `name` to its best match inside `text`: junk OCR picked up before or after the
// name (a stray "(", a rank digit, a neighbouring icon) costs nothing.
export function levInside(text: string, name: string): number {
  let prev = new Array(text.length + 1).fill(0);
  for (let i = 1; i <= name.length; i++) {
    const cur = [i];
    for (let j = 1; j <= text.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (name[i - 1] === text[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev);
}

// Edit distance of `text` to the closest beginning of `name`: a name cut off by the card frame.
export function levPrefix(text: string, name: string): number {
  let prev = Array.from({ length: name.length + 1 }, (_, j) => j);
  for (let i = 1; i <= text.length; i++) {
    const cur = [i];
    for (let j = 1; j <= name.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (text[i - 1] === name[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev);
}
