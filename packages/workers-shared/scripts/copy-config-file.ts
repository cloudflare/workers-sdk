/**
 * This script is temporary and will be deleted in a next iteration
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const pkgRoot = resolve(__dirname, "..");
const dstDirectory = join(pkgRoot, "dist");
const configFileSrc = join(pkgRoot, "asset-worker", "wrangler.jsonc");
const configFileDst = join(dstDirectory, "asset-worker.jsonc");

if (!existsSync(dstDirectory)) {
	mkdirSync(dstDirectory);
}

copyFileSync(configFileSrc, configFileDst);
