/**
 * This script is temporary and will be deleted in a next iteration
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const pkgRoot = resolve(__dirname, "..");
const dstDirectory = join(pkgRoot, "dist");
const configFileSrc = join(pkgRoot, "asset-worker", "wrangler.toml");
const configFileDst = join(dstDirectory, "asset-worker.toml");

if (!existsSync(dstDirectory)) {
	mkdirSync(dstDirectory);
}

copyFileSync(configFileSrc, configFileDst);
