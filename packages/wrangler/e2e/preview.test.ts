import { afterAll, beforeAll, describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { waitForWorkersDev } from "./helpers/wait-for-workers-dev";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("preview", { timeout: 90_000 }, () => {
	const workerName = generateResourceName();
	const previewName = "multipart-upload";
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: workerName,
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
				upload_source_maps: true,
				previews: {},
			}),
			"src/index.ts": `export default {
				fetch() {
					return new Response("Hello from a Preview");
				},
			};`,
		});
	});

	afterAll(async () => {
		await helper.bestEffortRun(
			`wrangler preview delete --name ${previewName} --worker-name ${workerName} -y`
		);
		await helper.bestEffortRun(`wrangler delete --name ${workerName} --force`);
	});

	it("uploads a preview deployment as multipart form data", async ({
		expect,
	}) => {
		const { stdout } = await helper.run(
			`wrangler preview --name ${previewName} --json`
		);

		expect(JSON.parse(stdout)).toMatchObject({
			preview: {
				name: previewName,
			},
			deployment: {
				id: expect.any(String),
				main_module: "index.js",
			},
		});
	});
});

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"preview declarative exports",
	{ timeout: 90_000 },
	() => {
		const workerName = generateResourceName();
		const previewName = "declarative-exports";
		const helper = new WranglerE2ETestHelper();

		beforeAll(async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: workerName,
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
					compatibility_flags: ["enable_ctx_exports"],
					exports: {
						EcommerceAgent: { type: "durable-object", storage: "sqlite" },
					},
					previews: {},
				}),
				"src/index.ts": `import { DurableObject } from "cloudflare:workers";

			export class EcommerceAgent extends DurableObject {
				fetch() {
					return new Response("Hello from the Preview Durable Object");
				}
			}

			export default {
				fetch(request, env, ctx) {
					return ctx.exports.EcommerceAgent.getByName("e2e").fetch(request);
				},
			};`,
			});
		});

		afterAll(async () => {
			await helper.bestEffortRun(
				`wrangler preview delete --name ${previewName} --worker-name ${workerName} -y`
			);
			await helper.bestEffortRun(
				`wrangler delete --name ${workerName} --force`
			);
		});

		it("calls a Durable Object through declarative exports", async ({
			expect,
		}) => {
			const { stdout } = await helper.run(
				`wrangler preview --name ${previewName} --json`
			);
			const output = JSON.parse(stdout);
			const response = await waitForWorkersDev(
				output.deployment.urls[0],
				async (candidate) =>
					(await candidate.clone().text()) ===
					"Hello from the Preview Durable Object"
			);

			expect(await response.text()).toBe(
				"Hello from the Preview Durable Object"
			);
		});
	}
);
