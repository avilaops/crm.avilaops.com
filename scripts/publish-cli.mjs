import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getNpmIdentity,
  loadNpmToken,
  packageVersionExists,
  runCommand,
  withTemporaryNpmConfig,
} from "./lib/npm-auth.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(projectRoot, "packages/cli/package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const requestedAuth = process.argv.includes("--token") ? "token" : "auto";
const tagIndex = process.argv.indexOf("--tag");
const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : "latest";

if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tag ?? "")) {
  throw new Error("Tag npm invalida.");
}

console.log(`Validando ${packageJson.name}@${packageJson.version}...`);
runCommand("npm", ["run", "cli:test"], { cwd: projectRoot });
runCommand("npm", ["run", "cli:pack"], { cwd: projectRoot });

if (dryRun) {
  console.log("Dry-run concluido. Nenhum pacote foi publicado.");
  process.exit(0);
}

const alreadyPublished = await packageVersionExists(packageJson.name, packageJson.version);

if (alreadyPublished) {
  throw new Error(
    `${packageJson.name}@${packageJson.version} ja existe. Use npm run cli:release -- patch.`,
  );
}

const publishArgs = [
  "publish",
  "--workspace",
  packageJson.name,
  "--access",
  "public",
  "--tag",
  tag,
];

let published = false;

if (requestedAuth === "auto") {
  try {
    const session = runCommand("npm", ["whoami"], { cwd: projectRoot, capture: true });
    console.log(`Sessao npm validada para ${session.stdout.trim()}.`);
    runCommand("npm", publishArgs, { cwd: projectRoot });
    published = true;
  } catch (error) {
    if (await packageVersionExists(packageJson.name, packageJson.version)) {
      published = true;
    } else {
      console.warn(`A sessao npm nao publicou o pacote: ${error.message}`);
    }
  }
}

if (!published) {
  const { token, source } = loadNpmToken(projectRoot);
  const npmUser = await getNpmIdentity(token);
  console.log(`Token npm validado para ${npmUser} via ${source}.`);
  await withTemporaryNpmConfig(token, async (userConfig) => {
    runCommand("npm", [...publishArgs, "--userconfig", userConfig], { cwd: projectRoot });
  });
}

let registryConfirmed = false;

for (let attempt = 1; attempt <= 10; attempt += 1) {
  if (await packageVersionExists(packageJson.name, packageJson.version)) {
    console.log(`Publicado: https://www.npmjs.com/package/${packageJson.name}`);
    registryConfirmed = true;
    break;
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
}

if (!registryConfirmed) {
  throw new Error("O npm aceitou a publicacao, mas a versao ainda nao apareceu no registry.");
}
