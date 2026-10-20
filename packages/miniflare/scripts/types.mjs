/**
 * Emit TypeScript declaration files (.d.ts) and optionally bundle them into a
 * single rolled-up declaration file using API Extractor.
 *
 * Usage:
 *   node scripts/types.mjs <tsconfig> [--bundle] [--watch]
 *
 * Arguments:
 *   <tsconfig>  Path to a tsconfig.json file (relative to the package root).
 *   --bundle    After emitting declarations, run API Extractor to roll up all
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
 *   2. If --bundle is set, rolls up declarations with API Extractor after each
 *      successful compilation.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { getPackage, pkgRoot } from "./common.mjs";

// --- CLI argument parsing ---

const argv = process.argv.slice(2);
/** Path to the tsconfig file, relative to the package root. */
const configName = argv[0];
/** When set, run API Extractor after emitting declarations. */
const bundle = argv.includes("--bundle");
/** When set, use tsrs watch mode to re-run on file changes. */
const watch = argv.includes("--watch");

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
				bundleTypes();
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
			bundleTypes();
		}
	});
}

// --- API Extractor: roll up .d.ts files into a single declaration file ---

// TODO: consider using more of api-extractor, it's got lots of nifty features
//  (automatic API docs in package READMEs?)

/** @type {import("@microsoft/api-extractor").IConfigFile} */
const extractorCfgObject = {
	projectFolder: "<lookup>",
	// Input: individual .d.ts files emitted by tsrs into dist-types/
	mainEntryPointFilePath: "<projectFolder>/dist-types/src/index.d.ts",
	compiler: {
		// Uses tsconfig.bundle.json which extends tsconfig.json but remaps
		// paths to point at dist-types/ instead of source files.
		tsconfigFilePath: path.join(pkgRoot, "tsconfig.bundle.json"),
	},
	apiReport: {
		enabled: false,
		reportFileName: "<unscopedPackageName>.api.md",
		reportFolder: "<projectFolder>/etc/",
		reportTempFolder: "<projectFolder>/temp/",
	},
	docModel: {
		enabled: false,
		apiJsonFilePath: "<projectFolder>/temp/<unscopedPackageName>.api.json",
	},
	dtsRollup: {
		enabled: true,
		untrimmedFilePath: "",
		betaTrimmedFilePath: "",
		// Output: single rolled-up declaration file
		publicTrimmedFilePath: "<projectFolder>/dist/src/index.d.ts",
		omitTrimmingComments: false,
	},
	tsdocMetadata: {
		enabled: false,
		tsdocMetadataFilePath: "<lookup>",
	},
	messages: {
		compilerMessageReporting: {
			default: { logLevel: "warning" },
		},
		extractorMessageReporting: {
			default: { logLevel: "warning" },
			"ae-missing-release-tag": { logLevel: "none" },
			// Our public config types transitively reference `@cloudflare/workers-shared`
			// (via `@cloudflare/config` -> `@cloudflare/workers-utils`), which has no
			// `exports`/`types` map, so bare imports resolve to its `.ts` source rather
			// than a `.d.ts`. API Extractor never surfaces those types in the rollup, so
			// this is a false positive we can safely ignore.
			"ae-wrong-input-file-type": { logLevel: "none" },
		},
	},
};

// Workaround: API Extractor resolves `index.d.ts` but not `index.ts` when
// following imported types from @cloudflare/workers-types. We temporarily
// replace the .d.ts with the .ts content so API Extractor can resolve them,
// then restore the original afterwards.
const workersTypesExperimental = path.join(
	pkgRoot,
	"node_modules",
	"@cloudflare",
	"workers-types",
	"experimental"
);
const indexTsPath = path.join(workersTypesExperimental, "index.ts");
const indexDtsPath = path.join(workersTypesExperimental, "index.d.ts");
const originalDtsContent = fs.readFileSync(indexDtsPath);

/**
 * Roll up individual .d.ts files (from dist-types/) into a single declaration
 * file (dist/src/index.d.ts) using API Extractor.
 *
 * Skipped when --bundle is not set.
 */
function bundleTypes() {
	if (!bundle) {
		return;
	}

	console.log(`\nBundling types...`);

	// Temporarily swap index.d.ts with index.ts content (see workaround above)
	fs.copyFileSync(indexTsPath, indexDtsPath);
	try {
		const extractorCfg = ExtractorConfig.prepare({
			projectFolderLookupToken: pkgRoot,
			packageJsonFullPath: path.join(pkgRoot, "package.json"),
			packageJson: getPackage(pkgRoot),
			configObjectFullPath: path.join(pkgRoot, "api-extractor.json"),
			configObject: extractorCfgObject,
		});

		const extractorRes = Extractor.invoke(extractorCfg, {
			localBuild: true,
			showVerboseMessages: true,
		});

		const { errorCount, warningCount } = extractorRes;
		const failed = errorCount + warningCount > 0;
		const colour = failed ? 31 : 32;
		console.log(
			[
				`\n\x1b[${colour}mBundled types `,
				`with ${errorCount} error(s) and ${warningCount} warning(s)`,
				"\x1b[39m",
			].join("")
		);
		if (failed) {
			process.exitCode = 1;
		}
	} finally {
		// Restore the original index.d.ts
		fs.writeFileSync(indexDtsPath, originalDtsContent);
	}
}

buildTypes();
