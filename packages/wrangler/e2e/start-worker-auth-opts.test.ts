import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";

describe("startWorker - auth options", () => {
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed(resolve(__dirname, "./seed-files/start-worker-auth"));
	});

	it("correctly connects to remote resources (AI) if correct auth data is provided", async () => {
		// eslint-disable-next-line unused-imports/no-unused-vars
		const {
			CLOUDFLARE_ACCOUNT_ID: _START_WORKER_TESTING_AUTH_ID,
			CLOUDFLARE_API_TOKEN: _START_WORKER_TESTING_AUTH_TOKEN,
			...env
		} = process.env;
		const spawnResult = spawnSync("node", ["index.mjs"], {
			cwd: helper.tmpPath,
			env: {
				...env,
				_START_WORKER_TESTING_AUTH_ID,
				_START_WORKER_TESTING_AUTH_TOKEN,
			},
		});

		expect(`${spawnResult.status}`).toBe("0");
		expect(`${spawnResult.stdout}`).toContain(
			'worker response: "This is a response from Workers AI."'
		);
	});

	it("fails to use remote resources (AI) if no auth data is provided", async () => {
		// eslint-disable-next-line unused-imports/no-unused-vars
		const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, ...env } = process.env;
		const spawnResult = spawnSync("node", ["index.mjs"], {
			cwd: helper.tmpPath,
			env,
		});

		expect(`${spawnResult.status}`).not.toBe("0");
		expect(`${spawnResult.stdout}`).not.toContain(
			'worker response: "This is a response from Workers AI."'
		);
	});
});
