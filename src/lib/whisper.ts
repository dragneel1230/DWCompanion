// In-game whisper text in the same shape warframe.market generates, so the other side
// recognises it. Russian text for players whose warframe.market locale is Russian.
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Order } from "$lib/api";

export interface TradeItem {
  en: string;
  ru: string;
}

const SUBTYPE_RU: Record<string, string> = {
  intact: "интакт",
  exceptional: "исключительная",
  flawless: "безупречная",
  radiant: "сияющая",
};

// Several pieces: "x6" before the name and the total price, as the site does
// (RU sample from the site: `Привет! Я хочу купить: x6 "Заражение Эксодии (ранг 0)" за 72 платины.`).
export function whisper(order: Order, item: TradeItem, lang: "auto" | "en" = "auto", count = 1): string {
  const ru = lang === "auto" && order.user.locale === "ru";
  const name = ru ? item.ru : item.en;
  let full = name;
  if (order.rank != null) full += ru ? ` (ранг ${order.rank})` : ` (rank ${order.rank})`;
  if (order.subtype) full += ` (${ru ? (SUBTYPE_RU[order.subtype] ?? order.subtype) : order.subtype})`;

  const qty = count > 1 ? `x${count} ` : "";
  const total = order.platinum * count;
  const who = `/w ${order.user.ingameName}`;
  // A sell order means we buy from them, and the other way round.
  if (ru) {
    const verb = order.type === "sell" ? "купить" : "продать";
    return `${who} Привет! Я хочу ${verb}: ${qty}"${full}" за ${total} платины. (warframe.market)`;
  }
  const verb = order.type === "sell" ? "buy" : "sell";
  return `${who} Hi! I want to ${verb}: ${qty}"${full}" for ${total} platinum. (warframe.market)`;
}

// System clipboard via Tauri (works even when the webview isn't focused), browser API as fallback.
export async function copyText(text: string): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch {
    // not running inside Tauri
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebView fallback.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
