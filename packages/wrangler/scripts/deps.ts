import fs from "node:fs";
import path from "node:path";
import { parsePackageJSON } from "../src/parse";

/**
 * Dependencies that _are not_ bundled along with wrangler
 */
export const EXTERNAL_DEPENDENCIES = [
	"fsevents",
	"esbuild",
	"blake3-wasm",
	"miniflare",
	"@miniflare/core",
	"@miniflare/durable-objects",
	"@miniflare/tre", // TODO: remove once Miniflare 3 moved in miniflare package
	"@miniflare/web-sockets",
	// todo - bundle miniflare too
	"selfsigned",
	"source-map",
	"@esbuild-plugins/node-globals-polyfill",
	"@esbuild-plugins/node-modules-polyfill",
	"chokidar",
];

const pathToPackageJson = path.resolve(__dirname, "..", "package.json");
const packageJson = fs.readFileSync(pathToPackageJson, { encoding: "utf-8" });
const { dependencies, devDependencies } = parsePackageJSON(
	packageJson,
	pathToPackageJson
);

/**
 * Dependencies that _are_ bundled along with wrangler
 */
export const BUNDLED_DEPENDENCIES = Object.keys({
	...dependencies,
	...devDependencies,
}).filter((dep) => !EXTERNAL_DEPENDENCIES.includes(dep));
