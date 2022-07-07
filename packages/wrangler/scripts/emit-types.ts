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
configObject.bundledPackages = BUNDLED_DEPENDENCIES;

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
