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

	describe("subdomain defaults warning", () => {
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

		it("show subdomain warnings on 2nd deploy, workers_dev", async () => {
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
                    # workers_dev = true # Defaults to true.
                    preview_urls = false
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
				"▲ [WARNING] Because 'workers_dev' is not in your Wrangler file, it will be enabled for this deployment by default.
				  To override this setting, you can disable workers.dev by explicitly setting 'workers_dev = false' in your Wrangler file."
			`);
		});

		it("show subdomain warnings on 3rd deploy, preview_urls", async () => {
			// Set remote state using `wrangler triggers deploy`.
			await helper.seed({
				"wrangler.toml": dedent`
                    name = "${workerName}"
                    main = "src/index.ts"
                    compatibility_date = "2023-01-01"
                    workers_dev = true
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
                    workers_dev = true
                    # preview_urls = workers_dev = true # Defaults to true.
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
				"▲ [WARNING] Because your 'workers.dev' route is enabled and your 'preview_urls' setting is not in your Wrangler file, Preview URLs will be enabled for this deployment by default.
				  To override this setting, you can disable Preview URLs by explicitly setting 'preview_urls = false' in your Wrangler file."
			`);
		});
	});
});
