import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import dotenv from "dotenv";

const REGISTRY_URL = "https://registry.npmjs.org";
const TOKEN_FILES = [
  ".env.publish.local",
];

export function loadNpmToken(projectRoot) {
  if (process.env.NPM_TOKEN?.trim()) {
    return { token: process.env.NPM_TOKEN.trim(), source: "process.env" };
  }

  for (const file of TOKEN_FILES) {
    try {
      const parsed = dotenv.parse(readFileSync(resolve(projectRoot, file)));
      if (parsed.NPM_TOKEN?.trim()) {
        return { token: parsed.NPM_TOKEN.trim(), source: file };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  throw new Error(
    "NPM_TOKEN nao encontrado. Configure a variavel de ambiente ou use .env.publish.local.",
  );
}

export async function getNpmIdentity(token) {
  const response = await fetch(`${REGISTRY_URL}/-/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || typeof body.username !== "string") {
    throw new Error(`Token npm recusado pelo registry (HTTP ${response.status}).`);
  }

  return body.username;
}

export async function packageVersionExists(packageName, version) {
  const encodedName = encodeURIComponent(packageName);
  const response = await fetch(`${REGISTRY_URL}/${encodedName}/${encodeURIComponent(version)}`);

  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Falha ao consultar ${packageName}@${version} (HTTP ${response.status}).`);
  }

  return true;
}

function resolveInvocation(command, args) {
  if (process.platform !== "win32") return { command, args };
  if (command === "node") return { command: process.execPath, args };

  if (command === "npm") {
    const candidates = [
      process.env.npm_execpath,
      join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
      process.env.APPDATA
        ? join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js")
        : null,
    ].filter(Boolean);
    const npmCli = candidates.find((candidate) => existsSync(candidate));
    if (!npmCli) throw new Error("npm-cli.js nao encontrado nesta instalacao do Node.js.");
    return { command: process.execPath, args: [npmCli, ...args] };
  }

  return { command, args };
}

export function runCommand(command, args, options = {}) {
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} terminou com codigo ${result.status}.${details}`);
  }

  return result;
}

export async function withTemporaryNpmConfig(token, callback) {
  const directory = mkdtempSync(join(tmpdir(), "agenda-npm-"));
  const userConfig = join(directory, ".npmrc");

  try {
    writeFileSync(
      userConfig,
      `registry=${REGISTRY_URL}/\n//registry.npmjs.org/:_authToken=${token}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return await callback(userConfig);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
