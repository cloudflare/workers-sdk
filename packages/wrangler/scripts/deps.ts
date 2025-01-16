import fs from "node:fs";
import path from "node:path";

/**
 * Dependencies that _are not_ bundled along with wrangler
 */
export const EXTERNAL_DEPENDENCIES = [
	// Wrangler depends on a pinned version of esbuild.
	"esbuild",

	// This blows up when bundled, and has WASM dependencies. Wrangler depends on a pinned version.
	"blake3-wasm",

	// Wrangler depends on a pinned version of Miniflare.
	"miniflare",

	// Pending deletion in v4...
	"@esbuild-plugins/node-globals-polyfill",
	"@esbuild-plugins/node-modules-polyfill",

	// @cloudflare/workers-types is an optional peer dependency of wrangler, so users can
	// get the types by installing the package (to what version they prefer) themselves
	"@cloudflare/workers-types",

	// unenv must be external because it contains unenv/runtime code which needs to be resolved
	// and read when we are bundling the worker application
	"unenv",

	// path-to-regexp must be external because it contains runtime code which needs to be resolved
	// and read when we are bundling the worker application.
	// See `templates/pages-template-workers`
	"path-to-regexp",

	// @cloudflare/kv-asset-handler must be external because it contains runtime code which needs to be resolved
	// and read when we are bundling the worker application
	// Pending deletion in v4...
	"@cloudflare/kv-asset-handler",

	// workerd contains a native binary, so must be external. Wrangler depends on a pinned version.
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
