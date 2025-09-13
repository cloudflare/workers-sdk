import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";

const TIMEOUT = 50_000;
const workerName = generateResourceName();
const normalize = (str: string) =>
	normalizeOutput(str, {
		[CLOUDFLARE_ACCOUNT_ID]: "CLOUDFLARE_ACCOUNT_ID",
	}).replaceAll(/^Author:.*$/gm, "Author:      person@example.com");

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("deploy", { timeout: TIMEOUT }, () => {
	let helper: WranglerE2ETestHelper;
	beforeAll(async () => {
		helper = new WranglerE2ETestHelper();
	});

	describe("subdomain warnings", () => {
		beforeAll(async () => {
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                `,
				"src/index.ts": dedent`
                    export default {
                        fetch(request) {
                            return new Response("Hello World!")
                        }
                    }
                `,
				"package.json": dedent`
                    {
                        "name": "${workerName}",
                        "version": "0.0.0",
                        "private": true
                    }
                `,
			});
		});

		afterAll(async () => {
			await helper.run(`wrangler delete`);
		});

		it("omit subdomain warnings on 1st deploy", async () => {
			const deploy = await helper.run("wrangler deploy");
			expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
				Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
				  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
				Current Version ID: 00000000-0000-0000-0000-000000000000"
			`);
			expect(normalize(deploy.stderr)).toMatchInlineSnapshot(`""`);
		});

		it("show subdomain warnings on 2nd deploy, remote enabled", async () => {
			// Set remote state using `wrangler triggers deploy`.
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                    workers_dev = true
                    preview_urls = true
                `,
			});
			await helper.run("wrangler triggers deploy");
			// Remove `workers_dev` and `preview_urls` props, and redeploy.
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                `,
			});
			const deploy = await helper.run("wrangler deploy");
			expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
				Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
				  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
				Current Version ID: 00000000-0000-0000-0000-000000000000"
			`);
			expect(normalize(deploy.stderr)).toMatchInlineSnapshot(`
				"▲ [WARNING] Worker has preview URLs enabled, but 'preview_urls' is not in the config.
				  Using default config 'preview_urls = false', current status will be overwritten."
			`);
		});

		it("show subdomain warnings on 3rd deploy, remote disabled", async () => {
			// Set remote state using `wrangler triggers deploy`.
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                    workers_dev = false
                    preview_urls = false
                `,
			});
			await helper.run("wrangler triggers deploy");
			// Remove `workers_dev` and `preview_urls` props, and redeploy.
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                `,
			});
			const deploy = await helper.run("wrangler deploy");
			expect(normalize(deploy.stdout)).toMatchInlineSnapshot(`
				"Total Upload: xx KiB / gzip: xx KiB
				Uploaded tmp-e2e-worker-00000000-0000-0000-0000-000000000000 (TIMINGS)
				Deployed tmp-e2e-worker-00000000-0000-0000-0000-000000000000 triggers (TIMINGS)
				  https://tmp-e2e-worker-00000000-0000-0000-0000-000000000000.SUBDOMAIN.workers.dev
				Current Version ID: 00000000-0000-0000-0000-000000000000"
			`);
			expect(normalize(deploy.stderr)).toMatchInlineSnapshot(`
				"▲ [WARNING] Worker has workers.dev disabled, but 'workers_dev' is not in the config.
				  Using default config 'workers_dev = true', current status will be overwritten."
			`);
		});
	});
});
