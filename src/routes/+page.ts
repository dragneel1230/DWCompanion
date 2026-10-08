// No home page of its own: the app opens on «Сейчас». Global search is Ctrl+K from any screen.
import { redirect } from "@sveltejs/kit";

export function load() {
  redirect(307, "/now");
}
