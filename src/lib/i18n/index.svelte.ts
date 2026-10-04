// Interface language. The pick is saved in localStorage ("dwc.lang"), shared by every window of the
// app (main, hub, reward overlay: same origin); the other windows follow it through the storage event.
// Game data (item, relic, node names, descriptions) comes from DE's dictionaries, built per language into
// static/data/<lang>/ (see dataUrl); a language change reloads the windows to load that data.
import ru from "./ru";
import en from "./en";

export type Lang = "ru" | "en";
export type Key = keyof typeof ru;
// A plain string, or plural forms picked by the "n" parameter (Intl.PluralRules).
export type Msg = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export const LANGS: { id: Lang; label: string }[] = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

const PACKS: Record<Lang, Record<Key, Msg>> = { ru, en };
const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US" };
const KEY = "dwc.lang";
const isLang = (v: unknown): v is Lang => v === "ru" || v === "en";

// Saved pick, else the system language (Russian systems get Russian, the rest English).
function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return v;
  } catch {
    // storage unavailable
  }
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

class I18n {
  lang = $state<Lang>(initial());

  set(lang: Lang) {
    if (lang === this.lang) return;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // storage unavailable: the pick lasts for this session
    }
    // The game data of the other language is a different file: start over with it.
    location.reload();
  }
}

export const i18n = new I18n();
document.documentElement.lang = i18n.lang;

// Another window switched the language: reload with its data (the hub and the overlay stay hidden meanwhile).
window.addEventListener("storage", (e) => {
  if (e.key === KEY && isLang(e.newValue) && e.newValue !== i18n.lang) location.reload();
});

// Game data file in the interface language: dataUrl("db.json") -> "/data/en/db.json".
export const dataUrl = (file: string) => `/data/${i18n.lang}/${file}`;

const plurals: Partial<Record<Lang, Intl.PluralRules>> = {};
const plural = (lang: Lang, n: number) => (plurals[lang] ??= new Intl.PluralRules(LOCALE[lang])).select(n);

// Message by key; {name} in the text is replaced by params.name. A plural message picks its form by params.n.
// Reads the current language, so templates and $derived re-run when it changes.
export function t(key: Key, params?: Record<string, string | number | null | undefined>): string {
  const lang = i18n.lang;
  const msg = PACKS[lang][key] ?? PACKS.ru[key] ?? key;
  let s: string;
  if (typeof msg === "string") s = msg;
  else {
    const n = Number(params?.n ?? 0);
    s = msg[plural(lang, n)] ?? msg.other ?? Object.values(msg)[0] ?? key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k] ?? "") : m));
  return s;
}

// A lookup table whose values follow the language: labels({ COMMON: "rarity.common" }).COMMON is
// t("rarity.common") at the moment of reading, so `MAP[x]` in a template stays reactive.
export function labels<K extends string>(keys: Record<K, Key>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) Object.defineProperty(out, k, { get: () => t(keys[k]), enumerable: true });
  return out;
}

// Message from the Rust side: "rust.<key>" or "rust.<key>|<param>" ({v} in the text). Anything else
// (an error from a library, the OS) is shown as it came.
export function fromRust(msg: string): string {
  const m = /^(rust\.[\w.]+)(?:\|([\s\S]*))?$/.exec(msg);
  if (!m || !(m[1] in PACKS.ru)) return msg;
  return t(m[1] as Key, { v: m[2] ?? "" });
}

// Locale for Intl / toLocaleString: "ru-RU", "en-US".
export const locale = () => LOCALE[i18n.lang];

// Number with the language's grouping: 1 214 965 / 1,214,965.
export const num = (n: number, digits?: number) =>
  n.toLocaleString(locale(), digits == null ? undefined : { maximumFractionDigits: digits });
