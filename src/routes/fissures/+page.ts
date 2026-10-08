// Old address: fissures are part of «Сейчас».
import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/now");
}
