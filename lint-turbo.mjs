import assert from "assert";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

const listResult = execSync(
	"pnpm --filter=!@cloudflare/workers-sdk list --recursive --depth -1 --parseable"
);
const paths = listResult.toString().trim().split("\n");
const vitePluginPlaygroundDir = path.join(
	"packages",
	"vite-plugin-cloudflare",
	"playground"
);

for (const p of paths) {
	if (!path.isAbsolute(p)) continue;

	const pkg = readJson(path.join(p, "package.json"));
	const relativePath = path.relative(process.cwd(), p);

	// Ensure playground packages don't have a "build" script (use "build:default" instead)
	if (relativePath.startsWith(`${vitePluginPlaygroundDir}${path.sep}`)) {
		assert(
			!pkg.scripts?.build,
			`Vite plugin playground package "${pkg.name}" should not have a "build" script. Use "build:default" instead.`
		);
	}

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
		const buildOutputs = turboConfig.tasks.build.outputs;
		assert(buildOutputs.length > 0);
	}

	// Ensure all packages with a vitest config file have a "test:ci" script
	if (
		existsSync(path.join(p, "vitest.config.ts")) ||
		existsSync(path.join(p, "vitest.config.mts"))
	) {
		assert(
			pkg.scripts["test:ci"],
			`Package "${p}" is missing a "test:ci" script in package.json`
		);
	}
}
