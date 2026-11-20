/**
 * Emit TypeScript declaration files (.d.ts) and optionally bundle them into a
 * single rolled-up declaration file using tsdown.
 *
 * Usage:
 *   node scripts/types.mjs <tsconfig> [--bundle] [--watch]
 *
 * Arguments:
 *   <tsconfig>  Path to a tsconfig.json file (relative to the package root).
 *   --bundle    After emitting declarations, run tsdown to roll up all
 *               .d.ts files into a single dist/src/index.d.ts. Only meaningful
 *               when the tsconfig emits declarations (emitDeclarationOnly).
 *   --watch     Re-run on file changes (uses the tsrs CLI watch mode).
 *
 * Examples:
 *   # Build: emit .d.ts to dist-types/, then bundle into dist/src/index.d.ts
 *   node scripts/types.mjs tsconfig.json --bundle
 *
 *   # Dev: emit + bundle in watch mode
 *   node scripts/types.mjs tsconfig.json --bundle --watch
 *
 *   # Dev: type-check workers in watch mode (no emit, no bundle)
 *   node scripts/types.mjs src/workers/tsconfig.json --watch
 *
 * How it works:
 *   1. Runs tsrs against the given tsconfig to check types and emit declarations.
 *   2. If --bundle is set, rolls up declarations with tsdown after each
 *      successful compilation.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { build } from "tsdown";
import { pkgRoot } from "./common.mjs";

// --- CLI argument parsing ---

const argv = process.argv.slice(2);
/** Path to the tsconfig file, relative to the package root. */
const configName = argv[0];
/** When set, run tsdown after emitting declarations. */
const bundle = argv.includes("--bundle");
/** When set, use tsrs watch mode to re-run on file changes. */
const watch = argv.includes("--watch");
let bundlePromise = Promise.resolve();

/** Queue rollups so watch rebuilds cannot write declarations concurrently. */
function queueBundle() {
	bundlePromise = bundlePromise.then(bundleTypes).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}

/** Run tsrs and bundle declarations after successful compilations. */
function buildTypes() {
	const compilerPath = fileURLToPath(
		new URL("bin/tsrs", import.meta.resolve("tsrs/package.json"))
	);
	const compiler = spawn(
		process.execPath,
		[
			compilerPath,
			"--project",
			configName,
			...(bundle ? ["--stripInternal"] : []),
			...(watch
				? ["--watch", "--preserveWatchOutput", "--pretty", "false"]
				: []),
		],
		{
			cwd: pkgRoot,
			stdio: watch && bundle ? ["inherit", "pipe", "inherit"] : "inherit",
		}
	);

	if (compiler.stdout) {
		const output = createInterface({ input: compiler.stdout });
		output.on("line", (line) => {
			console.log(line);
			// The watch status is printed only after all declaration files are written.
			if (line.endsWith("Found 0 errors. Watching for file changes.")) {
				queueBundle();
			}
		});
	}

	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.once(signal, () => compiler.kill(signal));
	}
	compiler.on("error", (error) => {
		console.error(error);
		process.exitCode = 1;
	});
	compiler.on("exit", (code, signal) => {
		process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
		if (code === 0 && !watch) {
			queueBundle();
		}
	});
}

/** Bundle tsrs declarations without invoking the TypeScript compiler again. */
async function bundleTypes() {
	if (!bundle) return;
	await build({
		cwd: pkgRoot,
		config: false,
		entry: { index: "dist-types/src/index.d.ts" },
		outDir: "dist/src",
		clean: false,
		format: "esm",
		fixedExtension: false,
		tsconfig: "tsconfig.bundle.json",
		sourcemap: process.env.SOURCEMAPS !== "false",
		dts: {
			dtsInput: true,
			emitDtsOnly: true,
			sourcemap: process.env.SOURCEMAPS !== "false",
		},
		deps: {
			neverBundle: (id) =>
				/^[^./]/.test(id) && !id.startsWith("miniflare:") && id !== "miniflare",
		},
		alias: {
			miniflare: path.join(pkgRoot, "dist-types/src/index.d.ts"),
			"miniflare:shared": path.join(
				pkgRoot,
				"dist-types/src/workers/shared/index.d.ts"
			),
			"miniflare:zod": path.join(
				pkgRoot,
				"dist-types/src/workers/shared/zod.worker.d.ts"
			),
		},
	});
}

buildTypes();
