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
<<<<<<< HEAD
	const package = JSON.parse(
		fs.readFileSync("./packages/triangle/package.json")
	);
	exec("git rev-parse --short HEAD", (err, stdout) => {
		if (err) {
			console.log(err);
			process.exit(1);
		}
		package.version = "0.0.0-" + stdout.trim();
		fs.writeFileSync(
			"./packages/triangle/package.json",
			JSON.stringify(package, null, "\t") + "\n"
		);
	});
=======
	const packageName = getArgs()[0] ?? "wrangler";
	const packageJsonPath = `./packages/${packageName}/package.json`;
	const package = JSON.parse(readFileSync(packageJsonPath));
	const stdout = execSync("git rev-parse --short HEAD", { encoding: "utf8" });
	package.version = "0.0.0-" + stdout.trim();
	writeFileSync(packageJsonPath, JSON.stringify(package, null, "\t") + "\n");
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f
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
