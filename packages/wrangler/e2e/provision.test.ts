import assert from "node:assert";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";

const TIMEOUT = 500_000;
const normalize = (str: string) => {
	return normalizeOutput(str, {
		[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
	});
};
const workerName = generateResourceName();

describe("provisioning", { timeout: TIMEOUT }, () => {
	let deployedUrl: string;
	let kvId: string;
	let d1Id: string;
	const helper = new WranglerE2ETestHelper();

	it("can run dev without resource ids", async () => {
		const worker = helper.runLongLived("wrangler dev --x-provision");

		const { url } = await worker.waitForReady();
		await fetch(url);

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(`"Hello World!"`);
	});

	beforeAll(async () => {
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"

						[[kv_namespaces]]
						binding = "KV"

						[[r2_buckets]]
						binding = "R2"

						[[d1_databases]]
						binding = "D1"
						`,
			"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello World!")
							}
						}`,
			"package.json": dedent`
						{
							"name": "${workerName}",
							"version": "0.0.0",
							"private": true
						}
						`,
		});
	});

	it("can provision resources and deploy worker", async () => {
		const worker = helper.runLongLived(
			`wrangler deploy --x-provision --x-auto-create`
		);
		await worker.exitCode;
		const output = await worker.output;
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			The following bindings need to be provisioned:
			- KV Namespaces:
			  - KV
			- D1 Databases:
			  - D1
			- R2 Buckets:
			  - R2
			Provisioning KV (KV Namespace)...
			🌀 Creating new KV Namespace "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-kv"...
			✨ KV provisioned with tmp-e2e-worker-00000000-0000-0000-0000-000000000000-kv
			--------------------------------------
			Provisioning D1 (D1 Database)...
			🌀 Creating new D1 Database "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-d1"...
			✨ D1 provisioned with tmp-e2e-worker-00000000-0000-0000-0000-000000000000-d1
			--------------------------------------
			Provisioning R2 (R2 Bucket)...
			🌀 Creating new R2 Bucket "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-r2"...
			✨ R2 provisioned with tmp-e2e-worker-00000000-0000-0000-0000-000000000000-r2
			--------------------------------------
			🎉 All resources provisioned, continuing with deployment...
			Your worker has access to the following bindings:
			- KV Namespaces:
			  - KV: 00000000000000000000000000000000
			- D1 Databases:
			  - D1: 00000000-0000-0000-0000-000000000000
			- R2 Buckets:
			  - R2: tmp-e2e-worker-00000000-0000-0000-0000-000000000000-r2
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
			  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);
		const urlMatch = output.match(
			/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
		);
		assert(urlMatch?.groups);
		deployedUrl = urlMatch.groups.url;

		const kvMatch = output.match(/- KV: (?<kv>[0-9a-f]{32})/);
		assert(kvMatch?.groups);
		kvId = kvMatch.groups.kv;

		const d1Match = output.match(/- D1: (?<d1>\w{8}-\w{4}-\w{4}-\w{4}-\w{12})/);
		assert(d1Match?.groups);
		d1Id = d1Match.groups.d1;

		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	it("can inherit bindings on re-deploy and won't re-provision", async () => {
		const worker = helper.runLongLived(`wrangler deploy --x-provision`);
		await worker.exitCode;
		const output = await worker.output;
		expect(normalize(output)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your worker has access to the following bindings:
			- KV Namespaces:
			  - KV
			- D1 Databases:
			  - D1
			- R2 Buckets:
			  - R2
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
			  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);

		const { text } = await retry(
			(s) => s.status !== 200,
			async () => {
				const r = await fetch(deployedUrl);
				return { text: await r.text(), status: r.status };
			}
		);
		expect(text).toMatchInlineSnapshot('"Hello World!"');
	});

	afterAll(async () => {
		// we need to add d1 back into the config because otherwise wrangler will
		// call the api for all 5000 or so db's the e2e test account has
		// :(
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"

						[[d1_databases]]
						binding = "D1"
						database_name = "${workerName}-d1"
						database_id = "${d1Id}"
						`,
		});
		let output = await helper.run(`wrangler r2 bucket delete ${workerName}-r2`);
		expect(output.stdout).toContain(`Deleted bucket`);
		output = await helper.run(`wrangler d1 delete ${workerName}-d1 -y`);
		expect(output.stdout).toContain(`Deleted '${workerName}-d1' successfully.`);
		output = await helper.run(`wrangler delete`);
		expect(output.stdout).toContain("Successfully deleted");
		const status = await retry(
			(s) => s === 200 || s === 500,
			() => fetch(deployedUrl).then((r) => r.status)
		);
		expect(status).toBe(404);

		output = await helper.run(
			`wrangler kv namespace delete --namespace-id ${kvId}`
		);
		expect(output.stdout).toContain(`Deleted KV namespace`);
	}, TIMEOUT);
});
