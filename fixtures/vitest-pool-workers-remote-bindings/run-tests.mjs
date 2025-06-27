/**
 * This fixture is particular since it needs to communicate with remote resources, namely
 * a remote worker.
 *
 * This script is used to deploy a remote worker and run the fixture using said worker.
 *
 * Alternatively you can simply deploy, using your account, the `./remote-worker.js` file as
 * a worker named `my-worker-test` and directly run the fixture using vitest.
 */
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "fs";

if (
	!process.env.TEST_CLOUDFLARE_API_TOKEN ||
	!process.env.TEST_CLOUDFLARE_ACCOUNT_ID
) {
	console.warn("No credentials provided, skipping test...");
	process.exit(0);
}

rmSync("./.tmp", { recursive: true, force: true });

cpSync("./src", "./.tmp/src", { recursive: true });
cpSync("./test", "./.tmp/test", { recursive: true });
cpSync("./vitest.workers.config.ts", "./.tmp/vitest.workers.config.ts");

const remoteWorkerName = `vitest-pool-workers-remote-worker-test-${
	randomUUID().split("-")[0]
}`;

const wranglerJson = JSON.parse(readFileSync("./wrangler.json", "utf8"));
wranglerJson.services[0].service = remoteWorkerName;

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

const env = {
	...process.env,
	CLOUDFLARE_API_TOKEN: process.env.TEST_CLOUDFLARE_API_TOKEN,
	CLOUDFLARE_ACCOUNT_ID: process.env.TEST_CLOUDFLARE_ACCOUNT_ID,
};

const deployOut = execSync("pnpm dlx wrangler deploy -c remote-wrangler.json", {
	stdio: "pipe",
	cwd: "./.tmp",
	env,
});

if (!new RegExp(`Deployed\\s+${remoteWorkerName}\\b`).test(`${deployOut}`)) {
	throw new Error(`Failed to deploy ${remoteWorkerName}`);
}

let errored = false;
try {
	execSync("pnpm test:vitest --config ./.tmp/vitest.workers.config.ts", {
		env,
	});
} catch {
	errored = true;
}

execSync(`pnpm dlx wrangler delete --name ${remoteWorkerName}`, { env });

rmSync("./.tmp", { recursive: true, force: true });

if (errored) {
	process.exit(1);
}
