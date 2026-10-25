#!/usr/bin/env node
/**
 * Valida os GLB de personagens com o validador oficial da Khronos (gltf-validator).
 * Uso: node tools/validate-characters.mjs
 * Sai com código 1 se algum arquivo tiver erros.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import validator from "gltf-validator";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/assets/characters");
const files = readdirSync(dir).filter((f) => f.endsWith(".glb"));
let failed = 0;
for (const f of files) {
  const bytes = readFileSync(resolve(dir, f));
  const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 20 });
  const { numErrors, numWarnings, numInfos, numHints } = report.issues;
  const info = report.info;
  console.log(`${numErrors ? "✘" : "✔"} ${f}: erros=${numErrors} avisos=${numWarnings} infos=${numInfos} dicas=${numHints} | animações=${info.animationCount} triângulos=${info.totalTriangleCount} skins=${info.hasSkins}`);
  for (const m of report.issues.messages.slice(0, 8)) console.log(`   ${m.severity} ${m.code}: ${m.message} (${m.pointer ?? ""})`);
  if (numErrors > 0) failed++;
}
process.exit(failed ? 1 : 0);
