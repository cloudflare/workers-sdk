import { execSync } from "node:child_process";
import { satisfies } from "semver";

/**
 * Trusted Publishing for dist-tag operations requires npm >=11.21.0 on 11.x
 * or >=12.2.0 on newer releases.
 */
function checkNpmVersion() {
	const npmVersionBuffer = execSync("npm --version");
	const npmVersion = npmVersionBuffer.toString().trim();
	if (!satisfies(npmVersion, "^11.21.0 || >=12.2.0")) {
		console.error(
			`Error: npm version ^11.21.0 or >=12.2.0 is required for Trusted Publishing with dist-tags, found version ${npmVersion}`
		);
		process.exit(1);
	}
}

if (require.main === module) {
	checkNpmVersion();
}
