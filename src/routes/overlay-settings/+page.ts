// Old address: overlay settings are part of «Настройки».
import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/settings");
}
