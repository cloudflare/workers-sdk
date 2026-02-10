// Generates a version tag which can be used with version upload and associated with sentry releases

import { execSync } from "node:child_process";

try {
	const hash = execSync("git rev-parse --short=10 HEAD").toString().trim();
	console.log(hash);
} catch {
	console.log("UNKNOWN");
}
