import assert from "node:assert";
import { fetch } from "undici";
import { afterAll, describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { retry } from "./helpers/retry";
import { waitForWorkersDev } from "./helpers/wait-for-workers-dev";

function getPreviewUrl(output: { stdout: string }): string {
	const match = output.stdout.match(/^Preview URL: (?<url>.+)$/m);
	assert(match?.groups);
	return match.groups.url;
}

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("preview", { timeout: 90_000 }, () => {
	const workerName = generateResourceName();
	const previewNames = {
		multipart: "multipart-upload",
		declarativeExports: "declarative-exports",
		localConfig: "local-config-lifecycle",
		remoteBase: "remote-base-lifecycle",
	};
	const helper = new WranglerE2ETestHelper();

	afterAll(async () => {
		for (const previewName of Object.values(previewNames)) {
			await helper.bestEffortRun(
				`wrangler preview delete --name ${previewName} --worker-name ${workerName} -y`
			);
		}
		await helper.bestEffortRun(`wrangler delete --name ${workerName} --force`);
	});

	it("uploads a preview deployment as multipart form data", async ({
		expect,
	}) => {
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
		const { stdout } = await helper.run(
			`wrangler preview --name ${previewNames.multipart} --json`
		);

		expect(JSON.parse(stdout)).toMatchObject({
			preview: {
				name: previewNames.multipart,
			},
			deployment: {
				id: expect.any(String),
				main_module: "index.js",
			},
		});
	});

	it("calls a Durable Object through declarative exports", async ({
		expect,
	}) => {
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
		const { stdout } = await helper.run(
			`wrangler preview --name ${previewNames.declarativeExports} --json`
		);
		const output = JSON.parse(stdout);
		const response = await waitForWorkersDev(
			output.deployment.urls[0],
			async (candidate) =>
				(await candidate.clone().text()) ===
				"Hello from the Preview Durable Object"
		);

		expect(await response.text()).toBe("Hello from the Preview Durable Object");
	});

	it("creates then updates a reachable Preview", async ({ expect }) => {
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: workerName,
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
				vars: { GREETING: "local-e2e" },
				previews: {},
			}),
			"src/index.ts": `export default {
					fetch(_request, env) {
						return new Response(env.GREETING);
					},
				};`,
		});
		const first = await helper.run(
			`wrangler preview --name ${previewNames.localConfig}`
		);
		expect(first.stdout).toContain(
			`Preview: ${previewNames.localConfig} (new)`
		);
		const firstResponse = await waitForWorkersDev(
			getPreviewUrl(first),
			async (candidate) => (await candidate.clone().text()) === "local-e2e"
		);
		expect(await firstResponse.text()).toBe("local-e2e");

		const second = await helper.run(
			`wrangler preview --name ${previewNames.localConfig}`
		);
		expect(second.stdout).toContain(
			`Preview: ${previewNames.localConfig} (updated)`
		);
		const secondResponse = await waitForWorkersDev(
			getPreviewUrl(second),
			async (candidate) => (await candidate.clone().text()) === "local-e2e"
		);
		expect(await secondResponse.text()).toBe("local-e2e");
	});

	it("applies a propagated Preview Base on update", async ({ expect }) => {
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: workerName,
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
				previews: {},
			}),
			"src/index.ts": `export default {
					fetch(_request, env) {
						return new Response(env.BASE_GREETING ?? "without-base");
					},
				};`,
		});
		const apiToken = process.env.CLOUDFLARE_API_TOKEN;
		assert(apiToken, "CLOUDFLARE_API_TOKEN environment variable is required");

		const first = await helper.run(
			`wrangler preview --name ${previewNames.remoteBase}`
		);
		expect(first.stdout).toContain(`Preview: ${previewNames.remoteBase} (new)`);

		const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/workers/${workerName}`;
		const patchResponse = await fetch(endpoint, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/merge-patch+json",
			},
			body: JSON.stringify({
				previews_base_config: {
					env: {
						BASE_GREETING: {
							type: "plain_text",
							text: "from-base-e2e",
						},
					},
				},
			}),
		});
		assert(
			patchResponse.ok,
			`Failed to update Preview Base: ${await patchResponse.text()}`
		);

		await retry(
			(response) =>
				response.result?.previews_base_config?.env?.BASE_GREETING === undefined,
			async () => {
				const response = await fetch(endpoint, {
					headers: { Authorization: `Bearer ${apiToken}` },
				});
				assert(
					response.ok,
					`Failed to read Preview Base: ${await response.text()}`
				);
				return (await response.json()) as {
					result?: {
						previews_base_config?: {
							env?: Record<string, unknown>;
						};
					};
				};
			}
		);

		const second = await helper.run(
			`wrangler preview --name ${previewNames.remoteBase}`
		);
		expect(second.stdout).toContain(
			`Preview: ${previewNames.remoteBase} (updated)`
		);
		const response = await waitForWorkersDev(
			getPreviewUrl(second),
			async (candidate) => (await candidate.clone().text()) === "from-base-e2e"
		);
		expect(await response.text()).toBe("from-base-e2e");
	});
});
