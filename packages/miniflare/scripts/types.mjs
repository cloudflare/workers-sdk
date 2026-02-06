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
 *   --watch     Re-run on file changes (uses the TS compiler watch API).
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
 *   1. Reads the given tsconfig and creates a TypeScript program.
 *   2. Calls program.emit() — the tsconfig controls whether this produces .d.ts
 *      files (emitDeclarationOnly: true) or is a no-op (noEmit: true).
 *   3. Reports any type errors. Exits with code 1 if there are errors.
 *   4. If --bundle is set, runs API Extractor to roll up the individual .d.ts
 *      files from dist-types/ into a single dist/src/index.d.ts.
 *
 * Based on:
 *   https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher
 */

import fs from "node:fs";
import path from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import ts from "typescript";
import { getPackage, pkgRoot } from "./common.mjs";

// --- CLI argument parsing ---

const argv = process.argv.slice(2);
/** Path to the tsconfig file, relative to the package root. */
const configName = argv[0];
/** When set, run API Extractor after emitting declarations. */
const bundle = argv.includes("--bundle");
/** When set, use the TS watch API to re-run on file changes. */
const watch = argv.includes("--watch");

// --- Diagnostics formatting ---

/** @type {ts.FormatDiagnosticsHost} */
const formatHost = {
	getCanonicalFileName: (path) => path,
	getCurrentDirectory: ts.sys.getCurrentDirectory,
	getNewLine: () => ts.sys.newLine,
};

/** @param {ts.Diagnostic} diagnostic */
function reportDiagnostic(diagnostic) {
	process.stderr.write(ts.formatDiagnostic(diagnostic, formatHost));
}

/**
 * Called by the watch compiler host when the watch status changes.
 * Triggers bundling after a successful recompilation.
 * @param {ts.Diagnostic} diagnostic
 * @param {string} _newLine
 * @param {ts.CompilerOptions} _options
 * @param {number} [errorCount]
 */
function reportWatchStatus(diagnostic, _newLine, _options, errorCount) {
	process.stderr.write(ts.formatDiagnostic(diagnostic, formatHost));
	if (errorCount === 0) {
		bundleTypes();
	}
}

// --- Main: compile and optionally bundle declarations ---

/**
 * Run the TypeScript compiler against the given tsconfig.
 *
 * In one-shot mode: creates a program, emits, checks diagnostics, then
 * optionally bundles. In watch mode: creates a watch program that
 * re-emits and re-bundles on every successful recompilation.
 */
function buildTypes() {
	const configPath = path.join(pkgRoot, configName);

	if (watch) {
		const host = ts.createWatchCompilerHost(
			configPath,
			{},
			ts.sys,
			ts.createEmitAndSemanticDiagnosticsBuilderProgram,
			reportDiagnostic,
			reportWatchStatus
		);
		ts.createWatchProgram(host);
		return;
	}

	// One-shot mode: parse config, create program, emit, report errors.
	const configFile = ts.readJsonConfigFile(configPath, ts.sys.readFile);
	const parsedConfig = ts.parseJsonSourceFileConfigFileContent(
		configFile,
		ts.sys,
		path.dirname(configPath)
	);

	if (parsedConfig.errors.length > 0) {
		parsedConfig.errors.forEach(reportDiagnostic);
		process.exitCode = 1;
		return;
	}

	const program = ts.createProgram({
		rootNames: parsedConfig.fileNames,
		options: parsedConfig.options,
	});

	// emit() respects the tsconfig: if noEmit is true, this is a no-op;
	// if emitDeclarationOnly is true, only .d.ts files are written.
	const result = program.emit();

	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.concat(result.diagnostics);
	diagnostics.forEach(reportDiagnostic);

	if (diagnostics.length > 0) {
		process.exitCode = 1;
		return;
	}

	bundleTypes();
}

// --- API Extractor: roll up .d.ts files into a single declaration file ---

// TODO: consider using more of api-extractor, it's got lots of nifty features
//  (automatic API docs in package READMEs?)

/** @type {import("@microsoft/api-extractor").IConfigFile} */
const extractorCfgObject = {
	projectFolder: "<lookup>",
	// Input: individual .d.ts files emitted by tsc into dist-types/
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
