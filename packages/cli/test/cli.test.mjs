import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import {
  findProjectRoot,
  inspectEnvFile,
  parseCliArguments,
} from "../src/cli.mjs";

test("parseCliArguments aceita cwd e json em qualquer posicao", () => {
  const parsed = parseCliArguments(["doctor", "--json", "--cwd", "."]);
  assert.equal(parsed.json, true);
  assert.deepEqual(parsed.args, ["doctor"]);
  assert.equal(parsed.cwd, process.cwd());
});

test("findProjectRoot encontra o marcador Agenda em um diretorio pai", () => {
  const root = mkdtempSync(join(tmpdir(), "agenda-cli-test-"));
  const nested = join(root, "a", "b");
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ agenda: { project: true } }));

  try {
    assert.equal(findProjectRoot(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inspectEnvFile relata nomes sem expor valores", () => {
  const root = mkdtempSync(join(tmpdir(), "agenda-cli-env-"));
  const envPath = join(root, ".env.local");
  const secret = "segredo-que-nao-pode-aparecer";
  writeFileSync(
    envPath,
    [
      "DATABASE_URL=postgresql://localhost/agenda",
      "PORT=3000",
      "DEFAULT_TENANT_SLUG=teste",
      `SETUP_TOKEN=${secret}`,
      "META_WEBHOOK_VERIFY_TOKEN=meta-seguro",
      "ADMIN_INITIAL_PASSWORD=senha-segura",
      "ENCRYPTION_KEY=chave-segura-com-mais-de-32-caracteres",
    ].join("\n"),
  );

  try {
    const result = inspectEnvFile(envPath, "local");
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.placeholders, []);
    assert.equal(JSON.stringify(result).includes(secret), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("inspectEnvFile identifica variaveis ausentes e exemplos", () => {
  const root = mkdtempSync(join(tmpdir(), "agenda-cli-env-"));
  const envPath = join(root, ".env.local");
  writeFileSync(envPath, "DATABASE_URL=troque-este-valor\nPORT=3000\n");

  try {
    const result = inspectEnvFile(envPath, "local");
    assert.ok(result.missing.includes("ENCRYPTION_KEY"));
    assert.deepEqual(result.placeholders, ["DATABASE_URL"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
