import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { makeRoot } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

function matchWorkersDev(stdout: string): string {
	return stdout.match(
		/https:\/\/smoke-test-worker-.+?\.(.+?\.workers\.dev)/
	)?.[1] as string;
}

describe("c3 integration", () => {
	let workerName: string;
	let workerPath: string;
	let workersDev: string | null = null;
	let run: typeof shellac;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		const root = await makeRoot();
		run = shellac.in(root).env(process.env);
		workerName = `smoke-test-worker-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		normalize = (str) =>
			normalizeOutput(str, { [workerName]: "smoke-test-worker" });
	});

	it("init project via c3", async () => {
		const pathToC3 = path.resolve(__dirname, "../../create-cloudflare");
		const env = {
			...process.env,
			WRANGLER_C3_COMMAND: `exec ${pathToC3}`,
		};

		await run.env(env)`$$ ${WRANGLER} init ${workerName} --yes`;

		expect(existsSync(workerPath)).toBe(true);
	});

	it("deploy the worker", async () => {
		const { stdout, stderr } = await run.in(workerPath)`$ ${WRANGLER} deploy`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded smoke-test-worker (TIMINGS)
			Published smoke-test-worker (TIMINGS)
			  https://smoke-test-worker.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		workersDev = matchWorkersDev(stdout);
		const responseText = await retry("", () =>
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.text())
		);
		expect(responseText).toMatchInlineSnapshot('"Hello World!"');
	});

	it("deletes the worker", async () => {
		const { stdout, stderr } = await run.in(workerPath)`$ ${WRANGLER} delete`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete smoke-test-worker? This action cannot be undone.
			🤖 Using default value in non-interactive context: yes
			Successfully deleted smoke-test-worker"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const status = await retry(200, () =>
			fetch(`https://${workerName}.${workersDev}`).then((r) => r.status)
		);
		expect(status).toBe(404);
	});
});
