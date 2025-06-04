import fs from "node:fs";
import path from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import ts from "typescript";
import { getPackage, pkgRoot } from "./common.mjs";

const argv = process.argv.slice(2);
const configName = argv[0];
const watch = argv[1] === "watch";

// Based on https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher

/**
 * @type {ts.FormatDiagnosticsHost}
 */
const formatHost = {
	getCanonicalFileName: (path) => path,
	getCurrentDirectory: ts.sys.getCurrentDirectory,
	getNewLine: () => ts.sys.newLine,
};

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
	} else {
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
}

/**
 * @param {ts.Diagnostic} diagnostic
 */
function reportDiagnostic(diagnostic) {
	process.stderr.write(ts.formatDiagnostic(diagnostic, formatHost));
}
/**
 * @param {ts.Diagnostic} diagnostic
 * @param {string} newLine
 * @param {ts.CompilerOptions} options
 * @param {number} [errorCount]
 */
function reportWatchStatus(diagnostic, newLine, options, errorCount) {
	process.stderr.write(ts.formatDiagnostic(diagnostic, formatHost));
	if (errorCount === 0) bundleTypes();
}

// TODO: consider using more of api-extractor, it's got lots of nifty features
//  (automatic API docs in package READMEs?)

// noinspection JSValidateJSDoc
/** @type {IConfigFile} */
const extractorCfgObject = {
	projectFolder: "<lookup>",
	mainEntryPointFilePath: "<projectFolder>/dist-types/src/index.d.ts",
	compiler: {
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

// `api-extractor` doesn't know to load `index.ts` instead of `index.d.ts` when
// resolving imported types, so copy `index.ts` to `index.d.ts`, bundle types,
// then restore the original contents. We need the original `index.d.ts` for
// typing the `packages/miniflare/src/workers` directory.
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
 * Bundle types for package into single .d.ts files and run other checks on
 * definitions (e.g. forgotten exports). Requires `tsc` be run in the root
 * of the repository before running this script.
 */
function bundleTypes() {
	// If we aren't building for the root `tsconfig.json`, don't bundle
	if (configName !== "tsconfig.json") return;

	console.log(`\nBundling types...`);

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
		const errorCount = extractorRes.errorCount;
		const warningCount = extractorRes.warningCount;
		const failed = errorCount + warningCount > 0;
		const colour = failed ? 31 : 32;
		console.log(
			[
				`\n\x1b[${colour}mBundled types `,
				`with ${errorCount} error(s) and ${warningCount} warning(s)`,
				"\x1b[39m",
			].join("")
		);
		if (failed) process.exitCode = 1;
	} finally {
		fs.writeFileSync(indexDtsPath, originalDtsContent);
	}
}

buildTypes();
