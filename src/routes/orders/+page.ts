// Old address: the warframe.market desk is a sub-tab of «Торговля» (?new=<slug>&type= open a new order).
import { redirect } from "@sveltejs/kit";

export function load({ url }) {
  redirect(307, `/trade?tab=orders${url.search ? "&" + url.search.slice(1) : ""}`);
}
