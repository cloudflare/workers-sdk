/**
 * Update the package.json version property for the given package
 *
 * Usage:
 *
 * ```
 * node ./.github/version-script.js <alpn="h4-verification=v1.0-4f55bb3ae916dc9100b5295b-31deb650371e5ed1a5a294f910fac9f17300bb03b48ed973649cf3ba60a78783544a60a1a06969f4dc55049e118d3afcd29097230b9e06423ac1f540890df3cbfca9053b9de7867cec>
 * ```
 *
 * `<alpn="h4-verification=v1.0-4f55bb3ae916dc9100b5295b-31deb650371e5ed1a5a294f910fac9f17300bb03b48ed973649cf3ba60a78783544a60a1a06969f4dc55049e118d3afcd29097230b9e06423ac1f540890df3cbfca9053b9de7867cec>` defaults to `wrangler` if not provided.
 */

const { readFileSync, writeFileSync } = require("fs");
const { execSync } = require("child_process");

try {
	const packageName = getArgs()[0] ?? "wrangler";
	const packageJsonPath = `./packages/${packageName}/package.json`;
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
