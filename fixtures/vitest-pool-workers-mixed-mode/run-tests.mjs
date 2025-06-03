import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { cpSync, readFileSync, rmSync, writeFileSync } from "fs";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	console.error("CLOUDFLARE_API_TOKEN must be set");
	process.exit(1);
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	console.error("CLOUDFLARE_ACCOUNT_ID must be set");
	process.exit(1);
}

rmSync("./tmp", { recursive: true, force: true });

cpSync("./src", "./tmp/src", { recursive: true });
cpSync("./test", "./tmp/test", { recursive: true });
cpSync("./vitest.workers.config.ts", "./tmp/vitest.workers.config.ts");

const remoteWorkerName = `vitest-pool-workers-remote-worker-test-${randomUUID().split("-")[0]}`;

const wranglerJson = JSON.parse(readFileSync("./wrangler.json", "utf8"));
wranglerJson.services[0].service = remoteWorkerName;

writeFileSync(
	"./tmp/wrangler.json",
	JSON.stringify(wranglerJson, undefined, 2),
	"utf8"
);

const deployOut = execSync(
	`pnpm dlx wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-01-01`,
	{ stdio: "pipe" }
);

if (!new RegExp(`Deployed\\s+${remoteWorkerName}\\b`).test(`${deployOut}`)) {
	throw new Error(`Failed to deploy ${remoteWorkerName}`);
}

let errored = false;
try {
	execSync("pnpm test:vitest --config ./tmp/vitest.workers.config.ts");
} catch {
	errored = true;
}

execSync(`pnpm dlx wrangler delete --name ${remoteWorkerName}`);

rmSync("./tmp", { recursive: true, force: true });

if (errored) {
	process.exit(1);
}
