/**
 * Update the package.json version property for the given package
 *
 * Usage:
 *
 * ```
 * node ./.github/version-script.js <package-name>
 * ```
 *
 * `<package-name>` defaults to `wrangler` if not provided.
 */

const { readFileSync, writeFileSync } = require("fs");
const { execSync } = require("child_process");

try {
	const packageName = getArgs()[0] ?? "wrangler";
	const packageJsonPath = `./packages/${packageName}/package.json`;
	const pkg = JSON.parse(readFileSync(packageJsonPath));
	const stdout = execSync("git rev-parse --short HEAD", { encoding: "utf8" });
	pkg.version = "0.0.0-" + stdout.trim();
	writeFileSync(packageJsonPath, JSON.stringify(pkg, null, "\t") + "\n");
} catch (error) {
	console.error(error);
	process.exit(1);
}

/**
 * Get the command line args, stripping `node` and script filename, etc.
 */
function getArgs() {
	const args = Array.from(process.argv);
	while (args.shift() !== module.filename) {}
	return args;
}
