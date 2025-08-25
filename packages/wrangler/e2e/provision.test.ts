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

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"provisioning",
	{ timeout: TIMEOUT },
	() => {
		let deployedUrl: string;
		let kvId: string;
		let kvId2: string;
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
			const worker = helper.runLongLived(`wrangler deploy --x-provision`);
			await worker.exitCode;
			const output = await worker.output;
			expect(normalize(output)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			The following bindings need to be provisioned:
			Binding        Resource
			env.KV         KV Namespace
			env.D1         D1 Database
			env.R2         R2 Bucket
			Provisioning KV (KV Namespace)...
			🌀 Creating new KV Namespace "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-kv"...
			✨ KV provisioned 🎉
			Provisioning D1 (D1 Database)...
			🌀 Creating new D1 Database "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-d1"...
			✨ D1 provisioned 🎉
			Provisioning R2 (R2 Bucket)...
			🌀 Creating new R2 Bucket "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-r2"...
			✨ R2 provisioned 🎉
			🎉 All resources provisioned, continuing with deployment...
			Your Worker has access to the following bindings:
			Binding                                                              Resource
			env.KV (00000000000000000000000000000000)                            KV Namespace
			env.D1 (00000000-0000-0000-0000-000000000000)                        D1 Database
			env.R2 (tmp-e2e-worker-00000000-0000-0000-0000-000000000000-r2)      R2 Bucket
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

			const kvMatch = output.match(/env.KV \((?<kv>[0-9a-f]{32})/);
			assert(kvMatch?.groups);
			kvId = kvMatch.groups.kv;

			const d1Match = output.match(
				/env.D1 \((?<d1>\w{8}-\w{4}-\w{4}-\w{4}-\w{12})/
			);
			assert(d1Match?.groups);
			d1Id = d1Match.groups.d1;

			const response = await retry(
				(resp) => !resp.ok,
				async () => await fetch(deployedUrl)
			);
			await expect(response.text()).resolves.toEqual("Hello World!");
		});

		it("can inherit bindings on re-deploy and won't re-provision", async () => {
			const worker = helper.runLongLived(`wrangler deploy --x-provision`);
			await worker.exitCode;
			const output = await worker.output;
			expect(normalize(output)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your Worker has access to the following bindings:
			Binding                 Resource
			env.KV (inherited)      KV Namespace
			env.D1 (inherited)      D1 Database
			env.R2 (inherited)      R2 Bucket
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
			  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
			Current Version ID: 00000000-0000-0000-0000-000000000000"
		`);

			const response = await retry(
				(resp) => !resp.ok,
				async () => await fetch(deployedUrl)
			);
			await expect(response.text()).resolves.toEqual("Hello World!");
		});

		it("can inherit and provision resources on version upload", async () => {
			await helper.seed({
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"

						[[r2_buckets]]
						binding = "R2"

						[[kv_namespaces]]
						binding = "KV2"
						`,
			});
			const worker = helper.runLongLived(
				`wrangler versions upload --x-provision`
			);
			await worker.exitCode;
			const output = await worker.output;
			expect(normalize(output)).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			The following bindings need to be provisioned:
			Binding         Resource
			env.KV2         KV Namespace
			Provisioning KV2 (KV Namespace)...
			🌀 Creating new KV Namespace "tmp-e2e-worker-00000000-0000-0000-0000-000000000000-kv2"...
			✨ KV2 provisioned 🎉
			🎉 All resources provisioned, continuing with deployment...
			Worker Startup Time: (TIMINGS)
			Your Worker has access to the following bindings:
			Binding                                         Resource
			env.KV2 (00000000000000000000000000000000)      KV Namespace
			env.R2 (inherited)                              R2 Bucket
			Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
			Worker Version ID: 00000000-0000-0000-0000-000000000000
			Version Preview URL: https://tmp-e2e-worker-PREVIEW-URL.SUBDOMAIN.workers.dev
			To deploy this version to production traffic use the command wrangler versions deploy
			Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy
			Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy"
		`);
			const kvMatch = output.match(/env.KV2 \((?<kv>[0-9a-f]{32})/);
			assert(kvMatch?.groups);
			kvId2 = kvMatch.groups.kv;
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

			await helper.run(`wrangler r2 bucket delete ${workerName}-r2`);
			await helper.run(`wrangler d1 delete ${workerName}-d1 -y`);
			await helper.run(`wrangler delete`);
			await helper.run(`wrangler kv namespace delete --namespace-id ${kvId}`);
			await helper.run(`wrangler kv namespace delete --namespace-id ${kvId2}`);
		}, TIMEOUT);
	}
);
