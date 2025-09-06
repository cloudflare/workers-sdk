import { execSync } from "node:child_process";
import { resolve } from "node:path";

async function deployWranglerE2EWorkers() {
	console.log("Deploying Wrangler E2E workers...");
	if (!process.env.CLOUDFLARE_API_TOKEN) {
		console.log("CLOUDFLARE_API_TOKEN not set, skipping worker deployment");
		return;
	}
	if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
		console.log("CLOUDFLARE_ACCOUNT_ID not set, skipping worker deployment");
		return;
	}

	const ensureWorkerDeployed = async (params: {
		dir: string;
		name: string;
		url: string;
		entry: string;
		compatibilityDate?: string;
	}) => {
		const { dir, name, url, entry, compatibilityDate = "2025-01-01" } = params;
		try {
			const res = await fetch(url);
			if (res.ok) {
				console.log(
					`Worker '${name}' already exists and is responding, skipping deployment`
				);
				return;
			}
		} catch {}
		console.log(`Deploying '${name}' from ${entry} ...`);
		execSync(
			`pnpx wrangler@latest deploy ${entry} --name ${name} --compatibility-date ${compatibilityDate}`,
			{ cwd: dir, env: process.env, stdio: "inherit" }
		);
	};

	const remoteBindingWorkersDir = resolve(
		__dirname,
		"../../packages/wrangler/e2e/remote-binding/workers"
	);

	await ensureWorkerDeployed({
		dir: remoteBindingWorkersDir,
		name: "wrangler-e2e-remote-binding-a",
		url: "https://wrangler-e2e-remote-binding-a.devprod-testing7928.workers.dev",
		entry: "remote-worker.js",
	});

	await ensureWorkerDeployed({
		dir: remoteBindingWorkersDir,
		name: "wrangler-e2e-remote-binding-b",
		url: "https://wrangler-e2e-remote-binding-b.devprod-testing7928.workers.dev",
		entry: "alt-remote-worker.js",
	});

	console.log("Wrangler E2E worker deployment complete");
}

if (require.main === module) {
	deployWranglerE2EWorkers().catch((error) => {
		console.error("Failed to deploy Wrangler E2E workers:", error);
		process.exit(1);
	});
}
