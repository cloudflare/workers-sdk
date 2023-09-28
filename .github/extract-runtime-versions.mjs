import assert from "node:assert";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import module from "node:module";
import path from "node:path";
import url from "node:url";
import { execSync } from "node:child_process";

/**
 * @param {string} from
 * @returns {string | undefined}
 */
function findClosestPackageJson(from) {
	while (true) {
		const packageJsonPath = path.join(from, "package.json");
		if (existsSync(packageJsonPath)) return packageJsonPath;
		const parent = path.dirname(from);
		if (parent === from) return;
		from = parent;
	}
}

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load `wrangler` `package.json`, getting `wrangler` version and `miniflare` version constraint
const wranglerPackagePath = path.resolve(__dirname, "../packages/wrangler");
const wranglerPackageJsonPath = path.join(wranglerPackagePath, "package.json");
const wranglerPackageJson = await fs.readFile(wranglerPackageJsonPath, "utf8");
const wranglerPackage = JSON.parse(wranglerPackageJson);
const wranglerVersion = wranglerPackage.version;
const miniflareVersionConstraint = wranglerPackage.dependencies.miniflare;

// 2. Load `miniflare` `package.json`, getting `miniflare` version and `workerd` version constraint
// (`createRequire()` just needs to be passed a file in the `wrangler` directory)
const wranglerRequire = module.createRequire(wranglerPackageJsonPath);
const miniflareMainPath = wranglerRequire.resolve("miniflare");
const miniflarePackageJsonPath = findClosestPackageJson(miniflareMainPath);
assert(miniflarePackageJsonPath !== undefined);
const miniflarePackageJson = await fs.readFile(
	miniflarePackageJsonPath,
	"utf8"
);
const miniflarePackage = JSON.parse(miniflarePackageJson);
const miniflareVersion = miniflarePackage.version;
const workerdVersionConstraint = miniflarePackage.dependencies.workerd;

// 3. Load `workerd` `package.json`, getting `workerd` version
const miniflareRequire = module.createRequire(miniflarePackageJsonPath);
const workerdMainPath = miniflareRequire.resolve("workerd");
const workerdPackageJsonPath = findClosestPackageJson(workerdMainPath);
assert(workerdPackageJsonPath !== undefined);
const workerdPackageJson = await fs.readFile(workerdPackageJsonPath, "utf8");
const workerdPackage = JSON.parse(workerdPackageJson);
const workerdVersion = workerdPackage.version;

const workerdBinary = path.resolve(workerdPackageJsonPath, "../bin/workerd");

const workerdBinaryVersion = execSync(workerdBinary + " --version")
	.toString()
	.split(" ")[1];

// 4. Write basic markdown report
const report = [
	`\`wrangler@${wranglerVersion}\` includes the following runtime dependencies:`,
	"",
	"|Package|Constraint|Resolved|",
	"|-------|----------|--------|",
	`|\`miniflare\`|${miniflareVersionConstraint}|${miniflareVersion}|`,
	`|\`workerd\`|${workerdVersionConstraint}|${workerdVersion}|`,
	`|\`workerd --version\`|${workerdVersion}|${workerdBinaryVersion}|`,
	"",
	"Please ensure constraints are pinned, and `miniflare`/`workerd` minor versions match.",
	"",
].join("\n");
await fs.writeFile("runtime-versions.md", report);
