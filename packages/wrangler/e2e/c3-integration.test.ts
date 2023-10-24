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
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;
	let c3Packed: string;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		const root = await makeRoot();
		runInRoot = shellac.in(root).env(process.env);
		workerName = `smoke-test-worker-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		runInWorker = shellac.in(workerPath).env(process.env);
		normalize = (str) =>
			normalizeOutput(str, { [workerName]: "smoke-test-worker" });

		const pathToC3 = path.resolve(__dirname, "../../create-cloudflare");
		const { stdout: version } = await shellac.in(pathToC3)`
			$ pnpm pack --pack-destination ./pack
			$ ls pack`;

		c3Packed = path.join(pathToC3, "pack", version);
	});

	it("init project via c3", async () => {
		const env = {
			...process.env,
			WRANGLER_C3_COMMAND: `--package ${c3Packed} dlx create-cloudflare`,
			GIT_AUTHOR_NAME: "test-user",
			GIT_AUTHOR_EMAIL: "test-user@cloudflare.com",
			GIT_COMMITTER_NAME: "test-user",
			GIT_COMMITTER_EMAIL: "test-user@cloudflare.com",
		};

		await runInRoot.env(env)`$$ ${WRANGLER} init ${workerName} --yes`;

		expect(existsSync(workerPath)).toBe(true);
	});

	it("deploy the worker", async () => {
		const { stdout, stderr } = await runInWorker`$ ${WRANGLER} deploy`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded smoke-test-worker (TIMINGS)
			Published smoke-test-worker (TIMINGS)
			  https://smoke-test-worker.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		workersDev = matchWorkersDev(stdout);
		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	it("delete the worker", async () => {
		const { stdout, stderr } = await runInWorker`$$ ${WRANGLER} delete`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"? Are you sure you want to delete smoke-test-worker? This action cannot be undone.
			🤖 Using default value in non-interactive context: yes
			Successfully deleted smoke-test-worker"
		`);
		expect(stderr).toMatchInlineSnapshot('""');
		const { status } = await retry(
			(s) => s.status === 200 || s.status === 500,
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(status).toBe(404);
	});
});
