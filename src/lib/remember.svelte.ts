// Per-view choices (tab filter, sort) kept across reopening: localStorage, per viewer only.
// `recall` reads the saved values over the defaults (wrong types are dropped); `keep` saves on change and
// must run while a component initializes.
export function recall<T extends Record<string, unknown>>(key: string, def: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    const out = { ...def };
    for (const k of Object.keys(def) as (keyof T)[]) if (typeof saved?.[k] === typeof def[k]) out[k] = saved[k];
    return out;
  } catch {
    return def;
  }
}

export function keep(key: string, get: () => Record<string, unknown>) {
  $effect(() => {
    const v = JSON.stringify(get());
    try {
      localStorage.setItem(key, v);
    } catch {
      // storage unavailable
    }
  });
}
