import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsdown";
import { getBuiltinModules } from "./scripts/rtti/query.mjs";
import type { UserConfig } from "tsdown";

const pkgRoot = path.resolve(import.meta.dirname);

function* walk(rootPath: string): Generator<string> {
	for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
		const filePath = path.join(rootPath, entry.name);
		if (entry.isDirectory()) {
			yield* walk(filePath);
		} else {
			yield filePath;
		}
	}
}

// Build pool, worker and libs
const libPaths = [
	...walk(path.join(pkgRoot, "src/worker/lib")),
	...walk(path.join(pkgRoot, "src/worker/node")),
];

// Derive bundler externals from package.json so devDependencies are always
// bundled and runtime dependencies/peer dependencies are always external.
// This prevents drift between package.json and the bundler config — the
// previous hand-maintained list incorrectly externalized undici and semver
// (both devDependencies), leaving the published bundle with unresolved
// imports for users who don't have those packages installed transitively.
const pkg = JSON.parse(
	readFileSync(path.join(pkgRoot, "package.json"), "utf-8")
) as {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};
const runtimeDeps = [
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.peerDependencies ?? {}),
];
// Match the bare package name and any subpath import (e.g. `vitest/node`).
const runtimeDepPatterns = runtimeDeps.flatMap((name) => [
	name,
	new RegExp(`^${name.replace(/[/\\^$+?.()|[\]{}]/g, "\\$&")}/`),
]);

const commonOptions: UserConfig = {
	platform: "node",
	target: "esnext",
	format: "esm",
	unbundle: false,
	noExternal: ["devalue"],
	external: [
		// Cloudflare/workerd built-ins
		/^cloudflare:.*$/,
		/^workerd:.*$/,
		// Virtual/runtime modules
		"__VITEST_POOL_WORKERS_DEFINES",
		"__VITEST_POOL_WORKERS_USER_OBJECT",
		// Runtime dependencies and peer dependencies (derived from package.json)
		...runtimeDepPatterns,
	],
	sourcemap: true,
	outDir: path.join(pkgRoot, "dist"),
	ignoreWatch: ["dist"],
};
export default defineConfig(async () => {
	const builtinModules = await getBuiltinModules();
	return [
		{
			...commonOptions,
			entry: path.join(pkgRoot, "src", "pool", "index.ts"),
			outDir: path.join(pkgRoot, "dist", "pool"),
			dts: true,
			define: {
				VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES:
					JSON.stringify(builtinModules),
			},
		},
		{
			...commonOptions,
			entry: [
				path.join(pkgRoot, "src", "worker", "index.ts"),
				...libPaths.filter((libPath) => /\.m?ts$/.test(libPath)),
			],
			outDir: path.join(pkgRoot, "dist", "worker"),
			dts: false,
			define: {
				VITEST_POOL_WORKERS_DEFINE_BUILTIN_MODULES:
					JSON.stringify(builtinModules),
			},
		},
		// Codemods — standalone jscodeshift-compatible transforms
		{
			...commonOptions,
			entry: path.join(pkgRoot, "src", "codemods", "vitest-v3-to-v4.ts"),
			outDir: path.join(pkgRoot, "dist", "codemods"),
			dts: false,
			// Codemods run in the user's Node.js environment via jscodeshift,
			// which provides its own AST manipulation API at runtime.
			// No bundled dependencies needed.
			external: [/./],
		},
	];
});
