// Old address: the inventory is split into «Торговля» and «Реликвии».
import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/trade");
}
