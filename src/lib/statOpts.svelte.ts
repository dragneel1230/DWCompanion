// Build boards' stat options (localStorage, shared by warframe and gear boards): count conditional effects
// of mods and arcanes ("On Kill: ... Stacks up to 5x") at full stacks; charge weapons show the charged shot.
export interface StatOpts {
  cond: boolean;
  charged: boolean;
}

const KEY = "dwc.statOpts";

function read(): StatOpts {
  try {
    return { cond: false, charged: false, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { cond: false, charged: false };
  }
}

class Store {
  value = $state<StatOpts>(read());

  set(patch: Partial<StatOpts>) {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage unavailable: lasts for this session
    }
  }
}

export const statOpts = new Store();
