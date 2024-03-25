import crypto from "node:crypto";
import path from "node:path";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeAll, chai, describe, expect, it } from "vitest";
import { retry } from "./helpers/retry";
import { makeRoot } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

chai.config.truncateThreshold = 1e6;

function matchWorkersDev(stdout: string): string {
	return stdout.match(
		/https:\/\/tmp-e2e-wrangler-.+?\.(.+?\.workers\.dev)/
	)?.[1] as string;
}

describe("deploy with dynamic esbuild versions", () => {
	let root: string;
	let workerName: string;
	let workerPath: string;
	let workersDev: string | null = null;
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;

	beforeAll(async () => {
		root = await makeRoot();
		workerName = `tmp-e2e-wrangler-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		runInRoot = shellac.in(root).env(process.env);
		runInWorker = shellac.in(workerPath).env(process.env);
	}, 50_000);

	async function assertWorkerIsReachable() {
		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	}

	it("init worker", async () => {
		await runInRoot`$ ${WRANGLER} init --yes --no-delegate-c3 ${workerName}`;
	});

	it("esbuild vnext", async () => {
		const deploy = await runInWorker`$ ${WRANGLER} deploy --x-esbuild`;
		workersDev = matchWorkersDev(deploy.stdout);

		expect(deploy.stderr).toContain("Experimental usage of esbuild v0.20.2");

		await assertWorkerIsReachable();
	});

	it("esbuild v20", async () => {
		const deploy = await runInWorker`$ ${WRANGLER} deploy --x-esbuild-20`;
		workersDev = matchWorkersDev(deploy.stdout);

		expect(deploy.stderr).toContain("Experimental usage of esbuild v0.20.2");

		await assertWorkerIsReachable();
	});

	it("esbuild v19", async () => {
		const deploy = await runInWorker`$ ${WRANGLER} deploy --x-esbuild-19`;
		workersDev = matchWorkersDev(deploy.stdout);

		expect(deploy.stderr).toContain("Experimental usage of esbuild v0.19.11");

		await assertWorkerIsReachable();
	});

	it("esbuild v18", async () => {
		const deploy = await runInWorker`$ ${WRANGLER} deploy --x-esbuild-18`;
		workersDev = matchWorkersDev(deploy.stdout);

		expect(deploy.stderr).toContain("Experimental usage of esbuild v0.18.20");

		await assertWorkerIsReachable();
	});

	it("esbuild v17", async () => {
		const deploy = await runInWorker`$ ${WRANGLER} deploy --x-esbuild-17`;
		workersDev = matchWorkersDev(deploy.stdout);

		expect(deploy.stderr).toContain("Experimental usage of esbuild v0.17.19");

		await assertWorkerIsReachable();
	});
});
