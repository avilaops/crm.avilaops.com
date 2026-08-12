import { rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["dist", "dist-server", "coverage"];

for (const target of targets) {
  const absoluteTarget = resolve(join(projectRoot, target));
  const relativeTarget = relative(projectRoot, absoluteTarget);

  if (!relativeTarget || relativeTarget.startsWith("..")) {
    throw new Error(`Recusando remover caminho fora do projeto: ${absoluteTarget}`);
  }

  rmSync(absoluteTarget, { recursive: true, force: true });
  console.log(`Removido: ${relativeTarget}`);
}
