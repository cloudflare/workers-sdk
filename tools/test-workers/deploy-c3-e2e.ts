import { execSync } from "node:child_process";
import { resolve } from "node:path";

export async function deployC3E2EWorkers() {
	console.log("Deploying C3 E2E workers...");

	if (!process.env.CLOUDFLARE_API_TOKEN) {
		console.log("CLOUDFLARE_API_TOKEN not set, skipping worker deployment");
		return;
	}

	if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
		console.log("CLOUDFLARE_ACCOUNT_ID not set, skipping worker deployment");
		return;
	}

	const existingScriptDir = resolve(
		__dirname,
		"existing-script-test-do-not-delete"
	);
	const existingScriptUrl =
		"https://existing-script-test-do-not-delete.devprod-testing7928.workers.dev";
	try {
		const response = await fetch(existingScriptUrl);
		if (response.ok) {
			console.log(
				"Worker 'existing-script-test-do-not-delete' already exists and is responding, skipping deployment"
			);
		} else {
			console.log(
				"Worker 'existing-script-test-do-not-delete' does not exist or is not responding, deploying..."
			);
			execSync("pnpx wrangler@latest deploy", {
				cwd: existingScriptDir,
				env: process.env,
				stdio: "inherit",
			});
		}
	} catch {
		console.log(
			"Worker 'existing-script-test-do-not-delete' does not exist or is not responding, deploying..."
		);
		execSync("pnpx wrangler@latest deploy", {
			cwd: existingScriptDir,
			env: process.env,
			stdio: "inherit",
		});
	}

	console.log("C3 E2E worker deployment complete");
}

if (require.main === module) {
	deployC3E2EWorkers().catch((error) => {
		console.error("Failed to deploy C3 E2E workers:", error);
		process.exit(1);
	});
}
