import assert from "assert";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

const listResult = execSync(
	"pnpm --filter=!wrangler-root list --recursive --depth -1 --parseable"
);
const paths = listResult.toString().trim().split("\n");
for (const p of paths) {
	if (!path.isAbsolute(p)) continue;

	const pkg = readJson(path.join(p, "package.json"));

	// Ensure all packages with a build script have a turbo build output configured
	if (pkg.scripts?.build) {
		console.log(pkg.name, "has build script. Checking turbo.json");
		let turboConfig;
		try {
			turboConfig = readJson(path.join(p, "turbo.json"));
		} catch {
			console.log("Failed to read turbo.json for", pkg.name);
			process.exit(1);
		}
		const buildOutputs = turboConfig.pipeline.build.outputs;
		assert(buildOutputs.length > 0);
	}

	// Ensure all packages with a vitest config file have a "test:ci" script
	if (existsSync(path.join(p, "vitest.config.ts"))) {
		assert(
			pkg.scripts["test:ci"],
			`Package "${p}" is missing a "test:ci" script in package.json`
		);
	}
}
