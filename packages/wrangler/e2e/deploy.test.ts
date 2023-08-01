import crypto from "node:crypto";
import path from "node:path";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { dedent, makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

function matchWorkersDev(stdout: string): string {
	return stdout.match(
		/https:\/\/smoke-test-worker-.+?\.(.+?\.workers\.dev)/
	)?.[1] as string;
}

describe("deploy", () => {
	let workerName: string;
	let workerPath: string;
	let workersDev: string | null = null;
	let runInRoot: typeof shellac;
	let runInWorker: typeof shellac;
	let normalize: (str: string) => string;

	beforeAll(async () => {
		const root = await makeRoot();
		runInRoot = shellac.in(root).env(process.env);
		workerName = `smoke-test-worker-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		runInWorker = shellac.in(workerPath).env(process.env);
		normalize = (str) =>
			normalizeOutput(str, { [workerName]: "smoke-test-worker" });
	});

	it("init worker", async () => {
		const { stdout } =
			await runInRoot`$ ${WRANGLER} init --yes --no-delegate-c3 ${workerName}`;

		expect(normalize(stdout)).toContain(
			"To publish your Worker to the Internet, run `npm run deploy`"
		);
	});

	it("deploy worker", async () => {
		const { stdout } = await runInWorker`$ ${WRANGLER} deploy`;
		expect(normalize(stdout)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Uploaded smoke-test-worker (TIMINGS)
			Published smoke-test-worker (TIMINGS)
			  https://smoke-test-worker.SUBDOMAIN.workers.dev
			Current Deployment ID: 00000000-0000-0000-0000-000000000000"
		`);
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

	it("modify & deploy worker", async () => {
		await seed(workerPath, {
			"src/index.ts": dedent`
        export default {
          fetch(request) {
            return new Response("Updated Worker!")
          }
        }`,
		});
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
			(s) => s.status !== 200 || s.text === "Hello World!",
			async () => {
				const r = await fetch(`https://${workerName}.${workersDev}`);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Updated Worker!"');
	});

	it("delete worker", async () => {
		const { stdout, stderr } = await runInWorker`$ ${WRANGLER} delete`;
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
