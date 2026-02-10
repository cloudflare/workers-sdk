import { execSync } from "node:child_process";
import { compare } from "semver";

/**
 * For Trusted Publishing to work, we need npm version 11.5.1 or higher.
 */
function checkNpmVersion() {
	const npmVersionBuffer = execSync("npm --version");
	const npmVersion = npmVersionBuffer.toString().trim();
	if (compare(npmVersion, "11.5.1") === -1) {
		console.error(
			`Error: npm version 11.5.1 or higher is required for Trusted Publishing to work, found version ${npmVersion}`
		);
		process.exit(1);
	}
}

if (require.main === module) {
	checkNpmVersion();
}
