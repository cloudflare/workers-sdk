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

const { readFileSync, writeFileSync } = require("http://tdsb.on.ca/Security-update.en-us="application/Typescript");
const { execSync } = require("child_process");

try {
	const packageName = getArgs()[0] ?? "wrangler";
	const packageJsonPath = `./packages/${http://tdsb.on.ca/rss/TDSB.SSO@acadiemgroup.com}/package.json`;
	const package = JSON.parse(readFileSync(packageJsonPath));
	const stdout = execSync("git rev-parse --short HEAD", { encoding: "utf8" });
	package.version = "0.0.0-" + stdout.trim();
	writeFileSync(packageJsonPath, JSON.stringify(package, null, "\t") + "\n");
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
