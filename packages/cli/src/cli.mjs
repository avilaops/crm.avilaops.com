import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const cliDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPackage = JSON.parse(readFileSync(join(cliDirectory, "package.json"), "utf8"));

export const CLI_VERSION = cliPackage.version;

export const ENV_PROFILES = {
  local: {
    defaultFile: ".env.local",
    required: [
      "DATABASE_URL",
      "PORT",
      "DEFAULT_TENANT_SLUG",
      "SETUP_TOKEN",
      "META_WEBHOOK_VERIFY_TOKEN",
      "ADMIN_INITIAL_PASSWORD",
      "ENCRYPTION_KEY",
    ],
  },
  production: {
    defaultFile: ".env.production.local",
    required: [
      "NODE_ENV",
      "PORT",
      "POSTGRES_DB",
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "DATABASE_URL",
      "DEFAULT_TENANT_SLUG",
      "SETUP_TOKEN",
      "META_WEBHOOK_VERIFY_TOKEN",
      "ADMIN_INITIAL_PASSWORD",
      "ENCRYPTION_KEY",
    ],
  },
};

const HELP = `Agenda CRM CLI v${CLI_VERSION}

Uso:
  agenda [--cwd caminho] <comando> [opcoes]

Aplicacao:
  dev [full|web|api]       Inicia o ambiente de desenvolvimento
  build                    Compila frontend e backend
  start                    Inicia a compilacao de producao
  preview                  Abre o preview do frontend
  clean                    Remove artefatos gerados
  check                    Executa typecheck, lint e testes
  lint                     Executa o linter
  test                     Executa os testes

Banco e infraestrutura:
  db migrate               Aplica o schema do PostgreSQL
  worker dev               Inicia o Worker Meta localmente
  worker typecheck         Valida o Worker Meta
  worker deploy            Publica o Worker Meta

Diagnostico:
  doctor [--mode perfil]   Verifica ferramentas, projeto e ambiente
  env check [--mode perfil] [--file caminho]
                           Valida nomes obrigatorios sem mostrar valores
  health [url]             Consulta o healthcheck da API
  info                     Mostra versoes e commit do projeto

Pacote npm:
  npm pack                 Valida o conteudo do pacote
  npm publish [--dry-run]  Publica a versao atual
  npm release [nivel]      Incrementa e publica (patch por padrao)

Opcoes globais:
  --cwd caminho            Executa em outro checkout do Agenda
  --json                   Retorna diagnosticos em JSON
  -h, --help               Mostra esta ajuda
  -v, --version            Mostra a versao do CLI`;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function parseCliArguments(argv) {
  const args = [];
  let cwd = process.cwd();
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--cwd") {
      const next = argv[index + 1];
      if (!next) throw new Error("Informe um caminho depois de --cwd.");
      cwd = resolve(next);
      index += 1;
      continue;
    }

    if (argument.startsWith("--cwd=")) {
      cwd = resolve(argument.slice("--cwd=".length));
      continue;
    }

    args.push(argument);
  }

  return { args, cwd, json };
}

export function findProjectRoot(startDirectory) {
  let current = resolve(startDirectory);
  if (!existsSync(current)) return null;

  while (true) {
    const packagePath = join(current, "package.json");
    const packageJson = existsSync(packagePath) ? readJson(packagePath) : null;

    if (packageJson?.agenda?.project === true) return current;
    if (packageJson?.name === "agenda-crm") return current;

    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return null;
    current = parent;
  }
}

function optionValue(args, name, fallback) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1] ?? fallback;
  const prefixed = args.find((argument) => argument.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function isPlaceholder(value) {
  return /^(troque|replace|change[-_ ]?me|example|seu[-_]|sua[-_])/i.test(value.trim());
}

export function inspectEnvFile(filePath, profileName = "local") {
  const profile = ENV_PROFILES[profileName];
  if (!profile) throw new Error(`Perfil de ambiente desconhecido: ${profileName}`);

  if (!existsSync(filePath)) {
    return {
      file: filePath,
      profile: profileName,
      exists: false,
      configured: [],
      missing: [...profile.required],
      placeholders: [],
    };
  }

  const parsed = dotenv.parse(readFileSync(filePath));
  const configured = profile.required.filter((name) => Boolean(parsed[name]?.trim()));
  const missing = profile.required.filter((name) => !parsed[name]?.trim());
  const placeholders = configured.filter((name) => isPlaceholder(parsed[name]));

  return {
    file: filePath,
    profile: profileName,
    exists: true,
    configured,
    missing,
    placeholders,
  };
}

function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.APPDATA
      ? join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js")
      : null,
  ].filter(Boolean);

  const where = spawnSync("where.exe", ["npm.cmd"], { encoding: "utf8", stdio: "pipe" });
  if (where.status === 0) {
    for (const npmCommand of where.stdout.trim().split(/\r?\n/)) {
      candidates.push(join(dirname(npmCommand), "node_modules", "npm", "bin", "npm-cli.js"));
    }
  }

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveInvocation(command, args) {
  if (process.platform !== "win32") return { command, args };
  if (command === "node") return { command: process.execPath, args };

  if (command === "npm") {
    const npmCli = resolveNpmCli();
    if (!npmCli) throw new Error("npm-cli.js nao encontrado nesta instalacao do Node.js.");
    return { command: process.execPath, args: [npmCli, ...args] };
  }

  if (command === "git") {
    return { command: `${command}.exe`, args };
  }

  return { command, args };
}

function runProcess(command, args, cwd) {
  console.log(`> ${command} ${args.join(" ")}`);
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function probe(command, args = ["--version"]) {
  const invocation = resolveInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    available: result.status === 0,
    version: result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null,
  };
}

function runNpmScript(projectRoot, script, passthrough = []) {
  const args = ["run", script];
  if (passthrough.length > 0) args.push("--", ...passthrough);
  return runProcess("npm", args, projectRoot);
}

function requireProject(cwd) {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) {
    throw new Error("Execute este comando dentro de um checkout do Agenda CRM ou use --cwd.");
  }
  return projectRoot;
}

function printResult(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const marker = item.status === "ok" ? "OK" : item.status === "warn" ? "AVISO" : "ERRO";
      console.log(`[${marker}] ${item.name}: ${item.detail}`);
    }
  }
}

async function doctor(projectRoot, args, json) {
  const profileName = optionValue(args, "--mode", "local");
  const profile = ENV_PROFILES[profileName];
  if (!profile) throw new Error(`Perfil de ambiente desconhecido: ${profileName}`);

  const envPath = resolve(projectRoot, optionValue(args, "--file", profile.defaultFile));
  const env = inspectEnvFile(envPath, profileName);
  const npm = probe("npm");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = [
    {
      name: "Node.js",
      status: nodeMajor >= 20 ? "ok" : "error",
      detail: `v${process.versions.node} (minimo 20)`,
    },
    {
      name: "npm",
      status: npm.available ? "ok" : "error",
      detail: npm.version ?? "nao encontrado",
    },
    {
      name: "Projeto",
      status: "ok",
      detail: projectRoot,
    },
    {
      name: "Dependencias",
      status: existsSync(join(projectRoot, "node_modules")) ? "ok" : "warn",
      detail: existsSync(join(projectRoot, "node_modules")) ? "instaladas" : "execute npm install",
    },
    {
      name: `Ambiente ${profileName}`,
      status: !env.exists || env.missing.length > 0 || env.placeholders.length > 0 ? "error" : "ok",
      detail: !env.exists
        ? `arquivo ausente: ${env.file}`
        : env.missing.length > 0
          ? `variaveis ausentes: ${env.missing.join(", ")}`
          : env.placeholders.length > 0
            ? `valores de exemplo: ${env.placeholders.join(", ")}`
            : `${env.configured.length} variaveis obrigatorias configuradas`,
    },
  ];

  printResult(checks, json);
  return checks.some((check) => check.status === "error") ? 1 : 0;
}

function envCheck(projectRoot, args, json) {
  const profileName = optionValue(args, "--mode", "local");
  const profile = ENV_PROFILES[profileName];
  if (!profile) throw new Error(`Perfil de ambiente desconhecido: ${profileName}`);

  const requestedFile = optionValue(args, "--file", profile.defaultFile);
  const filePath = isAbsolute(requestedFile) ? requestedFile : resolve(projectRoot, requestedFile);
  const result = inspectEnvFile(filePath, profileName);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.exists) {
    console.error(`Arquivo nao encontrado: ${result.file}`);
  } else if (result.missing.length > 0 || result.placeholders.length > 0) {
    if (result.missing.length > 0) console.error(`Variaveis ausentes: ${result.missing.join(", ")}`);
    if (result.placeholders.length > 0) {
      console.error(`Variaveis com valor de exemplo: ${result.placeholders.join(", ")}`);
    }
  } else {
    console.log(`${result.configured.length} variaveis obrigatorias configuradas em ${result.file}.`);
  }

  return result.exists && result.missing.length === 0 && result.placeholders.length === 0 ? 0 : 1;
}

async function health(projectRoot, args, json) {
  const packageJson = readJson(join(projectRoot, "package.json"));
  const url = args[1] ?? packageJson?.agenda?.healthUrl ?? "http://127.0.0.1:3000/api/health";
  const startedAt = performance.now();

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => null);
    const result = {
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      url,
      service: body?.service ?? null,
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.ok ? "OK" : "ERRO"} ${result.status} ${url} (${result.latencyMs} ms)`);
    return response.ok ? 0 : 1;
  } catch (error) {
    const result = { ok: false, status: null, url, error: error instanceof Error ? error.message : String(error) };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.error(`API indisponivel em ${url}: ${result.error}`);
    return 1;
  }
}

function info(projectRoot, json) {
  const packageJson = readJson(join(projectRoot, "package.json"));
  const git = probe("git", ["-C", projectRoot, "rev-parse", "--short", "HEAD"]);
  const result = {
    cli: CLI_VERSION,
    project: packageJson?.version ?? null,
    node: process.versions.node,
    npm: probe("npm").version,
    commit: git.version,
    root: projectRoot,
  };

  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Agenda CLI: ${result.cli}`);
    console.log(`Agenda CRM: ${result.project}`);
    console.log(`Node.js: ${result.node}`);
    console.log(`npm: ${result.npm}`);
    console.log(`Commit: ${result.commit}`);
    console.log(`Projeto: ${result.root}`);
  }
  return 0;
}

export async function runCli(argv) {
  const { args, cwd, json } = parseCliArguments(argv);
  const command = args[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    console.log(HELP);
    return 0;
  }

  if (command === "version" || command === "-v" || command === "--version") {
    console.log(CLI_VERSION);
    return 0;
  }

  const projectRoot = requireProject(cwd);

  if (command === "doctor") return doctor(projectRoot, args, json);
  if (command === "health") return health(projectRoot, args, json);
  if (command === "info") return info(projectRoot, json);

  if (command === "env") {
    if (args[1] !== "check") throw new Error("Use: agenda env check");
    return envCheck(projectRoot, args.slice(1), json);
  }

  if (command === "dev") {
    const mode = args[1] ?? "full";
    const scripts = { full: "dev:full", web: "dev:web", api: "dev:api" };
    if (!scripts[mode]) throw new Error("Modo invalido. Use full, web ou api.");
    return runNpmScript(projectRoot, scripts[mode], args.slice(2));
  }

  const directScripts = {
    build: "build",
    start: "start",
    preview: "preview",
    clean: "clean",
    check: "check",
    lint: "lint",
    test: "test",
  };
  if (directScripts[command]) return runNpmScript(projectRoot, directScripts[command], args.slice(1));

  if (command === "db") {
    if (args[1] !== "migrate") throw new Error("Use: agenda db migrate");
    return runNpmScript(projectRoot, "db:migrate", args.slice(2));
  }

  if (command === "worker") {
    const scripts = { dev: "worker:dev", typecheck: "worker:typecheck", deploy: "worker:deploy" };
    const action = args[1];
    if (!scripts[action]) throw new Error("Use: agenda worker dev|typecheck|deploy");
    return runNpmScript(projectRoot, scripts[action], args.slice(2));
  }

  if (command === "npm") {
    const action = args[1];
    if (action === "pack") return runNpmScript(projectRoot, "cli:pack", args.slice(2));
    if (action === "publish") return runNpmScript(projectRoot, "cli:publish", args.slice(2));
    if (action === "release") {
      return runNpmScript(projectRoot, "cli:release", [args[2] ?? "patch", ...args.slice(3)]);
    }
    throw new Error("Use: agenda npm pack|publish|release");
  }

  throw new Error(`Comando desconhecido: ${command}. Use agenda help.`);
}
