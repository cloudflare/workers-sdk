/**
 * This fixture is particular since it needs to communicate with remote resources, namely
 * two remote workers.
 *
 * This script is used to deploy the remote workers and run the fixture using said workers
 * with the appropriate vitest configurations.
 */
import assert from "node:assert";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const env = getAuthenticatedEnv();
if (!env) {
	console.warn("No credentials provided, skipping test...");
	process.exit(0);
}

rmSync("./.tmp", { recursive: true, force: true });

cpSync("./src", "./.tmp/src", { recursive: true });
cpSync("./test", "./.tmp/test", { recursive: true });
cpSync("./vitest.workers.config.ts", "./.tmp/vitest.workers.config.ts");
cpSync(
	"./vitest.workers.config.staging.ts",
	"./.tmp/vitest.workers.config.staging.ts"
);

const remoteWorkerName = `tmp-e2e-worker-test-remote-bindings-${randomUUID().split("-")[0]}`;
const remoteStagingWorkerName = `tmp-e2e-staging-worker-test-remote-bindings-${randomUUID().split("-")[0]}`;

const wranglerJson = JSON.parse(readFileSync("./wrangler.json", "utf8"));
wranglerJson.services[0].service = remoteWorkerName;
wranglerJson.env.staging.services[0].service = remoteStagingWorkerName;

writeFileSync(
	"./.tmp/wrangler.json",
	JSON.stringify(wranglerJson, undefined, 2),
	"utf8"
);

writeFileSync(
	"./.tmp/remote-wrangler.json",
	JSON.stringify(
		{
			name: remoteWorkerName,
			main: "../remote-worker.js",
			compatibility_date: "2025-06-01",
		},
		undefined,
		2
	),
	"utf8"
);

const deployOut = execSync(
	"pnpm wrangler deploy -c .tmp/remote-wrangler.json",
	{
		stdio: "pipe",
		cwd: "./.tmp",
		env,
		encoding: "utf8",
	}
);

if (!new RegExp(`Deployed\\s+${remoteWorkerName}\\b`).test(`${deployOut}`)) {
	throw new Error(`Failed to deploy ${remoteWorkerName}`);
}

const deployedUrl = deployOut.match(
	/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
)?.groups?.url;
assert(deployedUrl, "Failed to find deployed worker URL");

writeFileSync(
	"./.tmp/remote-wrangler.staging.json",
	JSON.stringify(
		{
			name: remoteStagingWorkerName,
			main: "../remote-worker.staging.js",
			compatibility_date: "2025-06-01",
		},
		undefined,
		2
	),
	"utf8"
);

const deployStagingOut = execSync(
	"pnpm wrangler deploy -c .tmp/remote-wrangler.staging.json",
	{
		stdio: "pipe",
		cwd: "./.tmp",
		env,
		encoding: "utf8",
	}
);
if (
	!new RegExp(`Deployed\\s+${remoteStagingWorkerName}\\b`).test(
		`${deployStagingOut}`
	)
) {
	throw new Error(`Failed to deploy ${remoteStagingWorkerName}`);
}
const deployedStagingUrl = deployStagingOut.match(
	/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
)?.groups?.url;
assert(deployedStagingUrl, "Failed to find deployed staging worker URL");

await setTimeout(2000);

// Wait for the workers to become available
await Promise.all([
	waitFor(async () => {
		const response = await fetch(deployedUrl);
		assert.equal(response.status, 200);
	}),
	waitFor(async () => {
		const response = await fetch(deployedStagingUrl);
		assert.equal(response.status, 200);
	}),
]);

try {
	try {
		try {
			console.log("Running vitest-pool-workers remote bindings tests...");
			execSync("pnpm test:vitest --config ./.tmp/vitest.workers.config.ts", {
				env,
				stdio: "inherit",
			});
			console.log(
				"Running vitest-pool-workers remote bindings staging tests..."
			);
			execSync(
				"pnpm test:vitest --config ./.tmp/vitest.workers.config.staging.ts",
				{
					env,
					stdio: "inherit",
				}
			);
		} finally {
			execSync(`pnpm wrangler delete --name ${remoteWorkerName}`, { env });
		}
	} finally {
		execSync(`pnpm wrangler delete --name ${remoteStagingWorkerName}`, { env });
	}
} finally {
	rmSync("./.tmp", { recursive: true, force: true });
}

/**
 * Gets an env object containing Cloudflare credentials or undefined if not authenticated.
 *
 * In the Github actions we convert the TEST_CLOUDFLARE_ACCOUNT_ID and TEST_CLOUDFLARE_API_TOKEN env variables.
 * In local development we can rely on CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env variables directly.
 */
function getAuthenticatedEnv() {
	const CLOUDFLARE_ACCOUNT_ID =
		process.env.TEST_CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
	const CLOUDFLARE_API_TOKEN =
		process.env.TEST_CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

	if (CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) {
		return {
			...process.env,
			CLOUDFLARE_API_TOKEN,
			CLOUDFLARE_ACCOUNT_ID,
		};
	}
	console.warn(
		"Skipping vitest-pool-workers remote bindings tests because the environment is not authenticated with Cloudflare."
	);
}

/**
 * Wait for the callback to execute successfully.
 *
 * If the callback throws an error or returns a rejected promise it will continue to wait until it succeeds or times out.
 */
export async function waitFor(callback) {
	const start = Date.now();
	while (true) {
		try {
			return callback();
		} catch (error) {
			if (Date.now() < start + 15_000) {
				throw error;
			}
		}
		await setTimeout(1_000);
	}
}
