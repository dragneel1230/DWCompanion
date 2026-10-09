// Share a build without a server: the build as JSON, deflated, base64url, behind a "DWC1." prefix.
// The same code carries a warframe build (Build) or a gear build (GearBuild); local-only fields are dropped.
import type { Build } from "$lib/frames";
import type { GearBuild } from "$lib/gear";

const PREFIX = "DWC1.";

export type Shared = { k: "f"; b: Build } | { k: "g"; b: GearBuild };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeBuild(x: Shared): Promise<string> {
  let b: Record<string, unknown>;
  if (x.k === "f") {
    const { votes: _v, demo: _d, source: _s, url: _u, author: _a, tags: _t, ...rest } = x.b;
    b = rest;
  } else {
    const { source: _s, author: _a, ...rest } = x.b;
    b = rest;
  }
  const json = new TextEncoder().encode(JSON.stringify({ k: x.k, b }));
  return PREFIX + toB64url(await pipe(json, new CompressionStream("deflate-raw")));
}

const strOrNull = (v: unknown) => v === null || typeof v === "string";
const strList = (v: unknown) => Array.isArray(v) && v.every(strOrNull);

// The code anywhere in the pasted text (a message may carry more words around it). Null: not a code / broken.
export async function decodeBuild(text: string): Promise<Shared | null> {
  const m = text.match(/DWC1\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const json = new TextDecoder().decode(await pipe(fromB64url(m[1]), new DecompressionStream("deflate-raw")));
    const x = JSON.parse(json);
    const b = x?.b;
    if (!b || !strList(b.slots) || !strList(b.arcanes ?? [])) return null;
    if (x.k === "f" && typeof b.frame === "string" && strOrNull(b.aura ?? null) && strOrNull(b.exilus ?? null))
      return { k: "f", b: { title: "", author: "", votes: 0, note: "", tags: [], arcanes: [], aura: null, exilus: null, ...b } };
    if (x.k === "g" && typeof b.item === "string" && strOrNull(b.exilus ?? null) && strOrNull(b.stance ?? null))
      return { k: "g", b: { title: "", author: "", arcanes: [], exilus: null, stance: null, ...b } };
    return null;
  } catch {
    return null;
  }
}

export const looksLikeCode = (text: string) => /DWC1\.[A-Za-z0-9_-]{8,}/.test(text);
