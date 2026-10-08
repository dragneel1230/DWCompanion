// Release: pnpm release <version> "<what's new>"   (or --notes-file <file>; --allow-dirty to skip the clean-tree check)
// Bumps the version (package.json, tauri.conf.json, Cargo.toml), builds the signed NSIS installer, writes
// latest.json, commits + tags vX.Y.Z, pushes them and publishes a GitHub release in the public repo
// (installed apps read releases/latest/download/latest.json, src/lib/updater.svelte.ts).
// Signing key: %USERPROFILE%\.tauri\dwcompanion.key (or TAURI_SIGNING_PRIVATE_KEY); see docs/RELEASE.md.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REPO = "dragneel1230/DWCompanion";
const KEY = process.env.TAURI_SIGNING_PRIVATE_KEY ?? join(homedir(), ".tauri", "dwcompanion.key");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const allowDirty = args.includes("--allow-dirty");
if (allowDirty) args.splice(args.indexOf("--allow-dirty"), 1);
const notesFile = flag("--notes-file");
const [version, ...rest] = args;
const notes = (notesFile ? readFileSync(notesFile, "utf8") : rest.join(" ")).trim();

const die = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};
const run = (cmd, a, opts = {}) => {
  const r = spawnSync(cmd, a, { stdio: "inherit", ...opts });
  if (r.status !== 0) die(`${cmd} ${a.join(" ")} — exit ${r.status}`);
};
const out = (cmd, a) => execFileSync(cmd, a, { encoding: "utf8" }).trim();

// ---------- checks
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) die('usage: pnpm release 0.2.0 "что нового"  (or --notes-file notes.md)');
if (!notes) die("release notes are empty: the update notice shows them to the tester");
if (!existsSync(KEY) && !process.env.TAURI_SIGNING_PRIVATE_KEY) die(`no signing key at ${KEY} (docs/RELEASE.md)`);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const cmp = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
if (cmp(version, pkg.version) <= 0) die(`version ${version} must be above the current ${pkg.version}`);
const tag = `v${version}`;
if (out("git", ["tag", "--list", tag])) die(`tag ${tag} already exists`);
if (!allowDirty && out("git", ["status", "--porcelain"])) die("uncommitted changes: commit them first (the release must match a commit), or pass --allow-dirty");
try {
  out("gh", ["auth", "status"]);
} catch {
  die("gh is not logged in: gh auth login");
}

// ---------- version bump
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
const confPath = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
const cargoPath = "src-tauri/Cargo.toml";
writeFileSync(cargoPath, readFileSync(cargoPath, "utf8").replace(/^version = "[^"]+"/m, `version = "${version}"`));

// ---------- build (signed updater artifacts: createUpdaterArtifacts in tauri.conf.json)
console.log(`\n▶ building ${tag}…`);
run("pnpm", ["tauri", "build"], {
  shell: process.platform === "win32", // pnpm.cmd; no spaces in these args
  env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
});

const dir = "src-tauri/target/release/bundle/nsis";
const exe = `${conf.productName}_${version}_x64-setup.exe`;
const exePath = join(dir, exe);
const sigPath = `${exePath}.sig`;
if (!existsSync(exePath) || !existsSync(sigPath)) die(`no ${exePath} or its .sig after the build`);

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sigPath, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/${tag}/${exe}`,
    },
  },
};
const latestPath = join(dir, "latest.json");
writeFileSync(latestPath, JSON.stringify(latest, null, 2));

// ---------- commit + tag here, publish there
const notesPath = join(dir, "notes.md");
writeFileSync(notesPath, notes + "\n");
run("git", ["add", "package.json", confPath, cargoPath, "src-tauri/Cargo.lock"]);
run("git", ["commit", "-m", `Release ${tag}`]);
run("git", ["tag", "-a", tag, "-F", notesPath]);
// The source is public in the same repo: the release's tag points at the pushed commit.
run("git", ["push", "origin", "HEAD:main", tag]);
console.log(`\n▶ publishing ${tag} to ${REPO}…`);
run("gh", ["release", "create", tag, exePath, latestPath, "-R", REPO, "--verify-tag", "--title", `DWCompanion ${version}`, "--notes-file", notesPath]);

console.log(`\n✓ ${tag} published: https://github.com/${REPO}/releases/tag/${tag}`);
console.log("  Installed apps will offer it within 6 hours (or at their next start).");
