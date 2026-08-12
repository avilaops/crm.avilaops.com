import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./lib/npm-auth.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedVersion = process.argv[2] ?? "patch";
const allowedVersions = new Set([
  "patch",
  "minor",
  "major",
  "prepatch",
  "preminor",
  "premajor",
  "prerelease",
]);
const isExactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion);

if (!allowedVersions.has(requestedVersion) && !isExactVersion) {
  throw new Error(
    "Versao invalida. Use patch, minor, major, uma variante pre* ou uma versao exata.",
  );
}

const status = runCommand(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: projectRoot, capture: true },
);

if (status.stdout.trim()) {
  throw new Error("Existem alteracoes rastreadas. Crie um commit antes de iniciar a release.");
}

const branch = runCommand(
  "git",
  ["branch", "--show-current"],
  { cwd: projectRoot, capture: true },
).stdout.trim();

if (branch !== "main") {
  throw new Error(`A release deve partir da branch main; branch atual: ${branch || "detached HEAD"}.`);
}

runCommand("git", ["fetch", "origin", "main"], { cwd: projectRoot });
const divergence = runCommand(
  "git",
  ["rev-list", "--left-right", "--count", "origin/main...HEAD"],
  { cwd: projectRoot, capture: true },
).stdout.trim();

if (divergence !== "0\t0" && divergence !== "0 0") {
  throw new Error(`A branch main precisa estar sincronizada com origin/main (${divergence}).`);
}

runCommand(
  "npm",
  [
    "version",
    requestedVersion,
    "--workspace",
    "@avilaops/agenda-cli",
    "--no-git-tag-version",
  ],
  { cwd: projectRoot },
);

runCommand("npm", ["install", "--package-lock-only", "--ignore-scripts"], { cwd: projectRoot });
runCommand("npm", ["run", "cli:test"], { cwd: projectRoot });
runCommand("npm", ["run", "cli:pack"], { cwd: projectRoot });

const packageJson = JSON.parse(
  readFileSync(resolve(projectRoot, "packages/cli/package.json"), "utf8"),
);
const tag = `agenda-cli-v${packageJson.version}`;

runCommand(
  "git",
  ["add", "packages/cli/package.json", "package-lock.json"],
  { cwd: projectRoot },
);
runCommand("git", ["commit", "-m", `Release Agenda CLI v${packageJson.version}`], {
  cwd: projectRoot,
});
runCommand("git", ["tag", "-a", tag, "-m", `Agenda CLI v${packageJson.version}`], {
  cwd: projectRoot,
});
runCommand("git", ["push", "origin", "main", tag], { cwd: projectRoot });

console.log(`Release enviada. Acompanhe o workflow da tag ${tag} no GitHub Actions.`);
