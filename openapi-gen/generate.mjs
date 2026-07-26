import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error('Usage: generate.mjs <spec.json> <output.d.ts>');
  process.exit(1);
}

if (existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(specPath).mtimeMs) {
  process.exit(0);
}

const ast = await openapiTS(pathToFileURL(resolve(specPath)));
console.log(`🚀 ${specPath} → ${outPath}`);
writeFileSync(outPath, astToString(ast));
