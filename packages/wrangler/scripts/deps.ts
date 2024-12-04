import fs from "node:fs";
import path from "node:path";

/**
 * Dependencies that _are not_ bundled along with wrangler
 */
export const EXTERNAL_DEPENDENCIES = [
	"fsevents",
	"esbuild",
	"blake3-wasm",
	"miniflare",
	// todo - bundle miniflare too
	"selfsigned",
	"source-map",
	"@esbuild-plugins/node-globals-polyfill",
	"@esbuild-plugins/node-modules-polyfill",
	"chokidar",
	// @cloudflare/workers-types is an optional peer dependency of wrangler, so users can
	// get the types by installing the package (to what version they prefer) themselves
	"@cloudflare/workers-types",
	// unenv must be external because it contains unenv/runtime code which needs to be resolved
	// and read when we are bundling the worker application
	"unenv",
	"workerd",
];

const pathToPackageJson = path.resolve(__dirname, "..", "package.json");
const packageJson = fs.readFileSync(pathToPackageJson, { encoding: "utf-8" });
const { dependencies, devDependencies } = JSON.parse(packageJson);

/**
 * Dependencies that _are_ bundled along with wrangler
 */
export const BUNDLED_DEPENDENCIES = Object.keys({
	...dependencies,
	...devDependencies,
}).filter((dep) => !EXTERNAL_DEPENDENCIES.includes(dep));
