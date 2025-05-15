import assert from "node:assert";
import test, { describe } from "node:test";
import { Miniflare } from "miniflare";
import { experimental_startMixedModeSession } from "wrangler";

process.env.CLOUDFLARE_ACCOUNT_ID = process.env.TEST_CLOUDFLARE_ACCOUNT_ID;
process.env.CLOUDFLARE_API_TOKEN = process.env.TEST_CLOUDFLARE_API_TOKEN;

// Mixed Mode relies on deploying a Worker to a user's account, and so the following tests require authentication
// This is provided in CI, but forks of the repo/running the fixture tests locally won't necessarily have authentication
// As such, we skip the tests if authentication isn't provided.
const baseDescribe =
	process.env.TEST_CLOUDFLARE_ACCOUNT_ID &&
	process.env.TEST_CLOUDFLARE_API_TOKEN
		? describe
		: describe.skip;

baseDescribe("startMixedModeSession", () => {
	test("simple AI request to the proxyServerWorker", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			AI: {
				type: "ai",
			},
		});
		const proxyServerUrl =
			mixedModeSession.mixedModeConnectionString.toString();
		assert.match(proxyServerUrl, /http:\/\/(localhost|127\.0\.0\.1):\d{4,5}\//);
		assert.match(
			await (
				await fetch(proxyServerUrl, {
					headers: {
						"MF-Binding": "AI",
						"MF-URL": "https://workers-binding.ai/ai-api/models/search",
					},
				})
			).text(),
			// Assert the catalog _at least_ contains a LLama model
			/Llama/
		);
		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});

	test("AI mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			AI: {
				type: "ai",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
				export default {
					async fetch(request, env) {
						const messages = [
							{
								role: "user",
								// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
								content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
							},
						];

						const content = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
							messages,
						});

						return new Response(content.response);
					}
				}
			`,
			ai: {
				binding: "AI",
				mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
			},
		});
		assert.match(
			await (await mf.dispatchFetch("http://example.com")).text(),
			/This is a response from Workers AI/
		);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});

	test("Browser mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			BROWSER: {
				type: "browser",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			compatibilityFlags: ["nodejs_compat"],
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					// Simulate acquiring a session
					const content = await env.BROWSER.fetch("http://fake.host/v1/acquire");
					return Response.json(await content.json());
				}
			}
		`,
			browserRendering: {
				binding: "BROWSER",
				mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
			},
		});

		assert.match(
			await (await mf.dispatchFetch("http://example.com")).text(),
			/sessionId/
		);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});

	test("External worker mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			SERVICE: {
				type: "service",
				service: "mixed-mode-test-target",
			},
			SERVICE_WITH_ENTRYPOINT: {
				type: "service",
				entrypoint: "CustomEntrypoint",
				service: "mixed-mode-test-target",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					try{
					return Response.json({
						"default": await (await env.SERVICE.fetch("http://example.com")).text(),
						"entrypoint": await (await env.SERVICE_WITH_ENTRYPOINT.fetch("http://example.com")).text()
					})}catch(e){console.log(e);return new Response(e)}
				}
			}
		`,
			serviceBindings: {
				SERVICE: {
					name: "mixed-mode-test-target",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
				SERVICE_WITH_ENTRYPOINT: {
					name: "mixed-mode-test-target",
					entrypoint: "CustomEntrypoint",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});
		const response = await (
			await mf.dispatchFetch("http://example.com")
		).text();
		assert.match(response, /Hello World/);
		assert.match(response, /Hello from entrypoint/);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});

	test("Dispatch Namespace mixed mode binding", async () => {
		const mixedModeSession = await experimental_startMixedModeSession({
			DISPATCH: {
				type: "dispatch_namespace",
				namespace: "mixed-mode-test-namespace",
			},
		});

		const mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					try{
						const worker = env.DISPATCH.get("mixed-mode-test-customer-worker")
					return Response.json({
						"worker": await (await worker.fetch("http://example.com")).text(),
					})}catch(e){console.log(e);return new Response(e)}
				}
			}
		`,
			dispatchNamespaces: {
				DISPATCH: {
					namespace: "mixed-mode-test-namespace",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});
		const response = await (
			await mf.dispatchFetch("http://example.com")
		).text();
		assert.match(response, /Hello from customer worker/);
		await mf.dispose();

		await mixedModeSession.ready;
		await mixedModeSession.dispose();
	});
});
