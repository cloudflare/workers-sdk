import { execSync } from "node:child_process";

if (!process.env.WRANGLER) {
	console.warn(
		"No `WRANGLER` process environment variable provided - running local build of Wrangler"
	);
}
if (!process.env.WRANGLER_IMPORT) {
	console.warn(
		"No `WRANGLER_IMPORT` process environment variable provided - importing from the local build of Wrangler"
	);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.warn(
		"No `CLOUDFLARE_ACCOUNT_ID` variable provided, skipping API tests"
	);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.warn(
		"No `CLOUDFLARE_API_TOKEN` variable provided, skipping API tests"
	);
}

function isDockerRunning() {
	try {
		execSync("docker ps", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Indicates whether the test is being run locally (not in CI) AND docker is currently not running on the system */
const isLocalWithoutDockerRunning =
	process.env.CI !== "true" && !isDockerRunning();

if (isLocalWithoutDockerRunning) {
	process.env.LOCAL_TESTS_WITHOUT_DOCKER = "true";
}

if (isLocalWithoutDockerRunning) {
	console.warn(
		"The tests are running locally but there is no docker instance running on the system, skipping containers tests"
	);
}

// Exporting noop vitest setup function allows it to be loaded as a setup file.
export const setup = () => {};
