import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Deploy all test workers for CI
 */
async function deployTestWorkers() {
	console.log("Deploying test workers...");

	// Check if we have the required environment variables
	if (!process.env.CLOUDFLARE_API_TOKEN) {
		console.log("CLOUDFLARE_API_TOKEN not set, skipping worker deployment");
		return;
	}

	if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
		console.log("CLOUDFLARE_ACCOUNT_ID not set, skipping worker deployment");
		return;
	}

	// Deploy existing-script-test-do-not-delete worker
	const workerDir = resolve(__dirname, "existing-script-test-do-not-delete");
	const workerUrl =
		"https://existing-script-test-do-not-delete.devprod-testing7928.workers.dev";

	try {
		// Check if worker exists and deploy only if it doesn't
		const response = await fetch(workerUrl);
		if (response.ok) {
			console.log(
				"Worker 'existing-script-test-do-not-delete' already exists and is responding, skipping deployment"
			);
		} else {
			console.log(
				"Worker 'existing-script-test-do-not-delete' does not exist or is not responding, deploying..."
			);
			execSync("pnpx wrangler@latest deploy", {
				cwd: workerDir,
				env: process.env,
				stdio: "inherit",
			});
		}
	} catch {
		console.log(
			"Worker 'existing-script-test-do-not-delete' does not exist or is not responding, deploying..."
		);
		execSync("pnpx wrangler@latest deploy", {
			cwd: workerDir,
			env: process.env,
			stdio: "inherit",
		});
	}

	console.log("Test worker deployment complete");
}

if (require.main === module) {
	deployTestWorkers().catch((error) => {
		console.error("Failed to deploy test workers:", error);
		process.exit(1);
	});
}
