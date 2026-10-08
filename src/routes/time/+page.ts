// Old address: timers are part of «Сейчас» (?baro: Baro's goods).
import { redirect } from "@sveltejs/kit";

export function load({ url }) {
  redirect(307, `/now${url.search || "?time"}`);
}
