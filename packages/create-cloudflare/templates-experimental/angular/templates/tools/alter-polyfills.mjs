import fs from "node:fs";
import { EOL } from "node:os";
import { join } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Split by lines and comment the banner
 * ```
 * import { createRequire } from 'node:module';
 * globalThis['require'] ??= createRequire(import.meta.url);
 * ```
 */
const serverPolyfillsFile = join(
  dirname,
  "../dist/server/polyfills.server.mjs"
);
const serverPolyfillsData = fs
  .readFileSync(serverPolyfillsFile, "utf8")
  .split(/\r?\n/);

for (let index = 0; index < 2; index++) {
  if (serverPolyfillsData[index].includes("createRequire")) {
    serverPolyfillsData[index] = "// " + serverPolyfillsData[index];
  }
}

// Add needed polyfills
serverPolyfillsData.unshift(`globalThis['process'] = {};`);

fs.writeFileSync(serverPolyfillsFile, serverPolyfillsData.join(EOL));
