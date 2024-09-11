import fs from "node:fs";
import path from "node:path";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { BUNDLED_DEPENDENCIES } from "./deps";

const configObjectFullPath = path.join(__dirname, "../api-extractor.json");

const packageJsonFullPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(
	fs.readFileSync(packageJsonFullPath, { encoding: "utf-8" })
);

// Load and parse the api-extractor.json file
const configObject = ExtractorConfig.loadFile(configObjectFullPath);

// include the dependencies we want to bundle
configObject.bundledPackages = BUNDLED_DEPENDENCIES.filter(
	(d) => d !== "cloudflare" && d !== "@iarna/toml"
);

const pkgRoot = path.resolve(__dirname, "..");

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

fs.copyFileSync(indexTsPath, indexDtsPath);

try {
	const extractorConfig = ExtractorConfig.prepare({
		configObject,
		configObjectFullPath,
		packageJsonFullPath,
		packageJson,
	});

	// Invoke API Extractor
	const extractorResult = Extractor.invoke(extractorConfig, {
		// Equivalent to the "--local" command-line parameter
		localBuild: true,

		// Equivalent to the "--verbose" command-line parameter
		showVerboseMessages: true,
	});

	if (extractorResult.succeeded) {
		console.log(`API Extractor completed successfully`);
		process.exitCode = 0;
	} else {
		console.error(
			`API Extractor completed with ${extractorResult.errorCount} errors` +
				` and ${extractorResult.warningCount} warnings`
		);
		process.exitCode = 1;
	}
} finally {
	fs.writeFileSync(indexDtsPath, originalDtsContent);
}
