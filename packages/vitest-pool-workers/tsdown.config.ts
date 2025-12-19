import { readdirSync } from "node:fs";
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
		// All npm packages (previously handled by packages: "external")
		"cjs-module-lexer",
		"esbuild",
		"miniflare",
		"semver",
		"semver/*",
		"wrangler",
		"zod",
		"undici",
		"undici/*",
		// Peer dependencies
		"vitest",
		"vitest/*",
		"@vitest/runner",
		"@vitest/snapshot",
		"@vitest/snapshot/*",
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
	];
});
