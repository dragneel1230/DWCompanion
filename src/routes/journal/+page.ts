// Old address: the journal is a sub-tab of «Реликвии».
import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/relics?tab=journal");
}
