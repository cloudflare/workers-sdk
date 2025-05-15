import assert from "node:assert";
import test, { afterEach, describe } from "node:test";
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
	let mixedModeSession;
	let mf;
	afterEach(async () => {
		await mf?.ready;
		await mf?.dispose();
		mf = undefined;
		await mixedModeSession?.ready;
		await mixedModeSession?.dispose();
		mixedModeSession = undefined;
	});
	test.skip("simple AI request to the proxyServerWorker", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
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
	});

	test.skip("AI mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			AI: {
				type: "ai",
			},
		});

		mf = new Miniflare({
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
	});

	test.skip("Browser mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			BROWSER: {
				type: "browser",
			},
		});

		mf = new Miniflare({
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
	});

	test.skip("External worker mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
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

		mf = new Miniflare({
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
	});

	test.skip("KV mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			KV_BINDING: {
				type: "kv_namespace",
				id: "ba14dd78fadb450ab5fa3a9afcca991f",
				preview_id: "ba14dd78fadb450ab5fa3a9afcca991f",
			},
		});

		mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					try{
										    // write a key-value pair
    await env.KV_BINDING.put('KEY', 'VALUE');

	// read a key-value pair
	const value = await env.KV_BINDING.get('KEY');

	// list all key-value pairs
	const allKeys = await env.KV_BINDING.list();

	// delete a key-value pair
	// await env.KV_BINDING.delete('KEY');

	// return a Workers response
	return new Response(
	  JSON.stringify({
		value: value,
		allKeys: allKeys,
		preExisting: await env.KV_BINDING.get('MIXED_MODE')
	  }),
	);
					}catch(e){console.log(e);return new Response(e)}
				}
			}
		`,
			kvNamespaces: {
				KV_BINDING: {
					id: "ba14dd78fadb450ab5fa3a9afcca991f",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});
		const response = await (
			await mf.dispatchFetch("http://example.com")
		).text();
		console.log(response);
		assert.match(response, /"preExisting":"true"/);
	});

	test.skip("R2 mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			R2_BINDING: {
				type: "r2_bucket",
				bucket_name: "mixed-mode-r2-bucket-test",
			},
		});

		mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					try {
						// Put an object into the bucket
						await env.R2_BINDING.put("test-key", "test-value");

						// Retrieve the object
						const obj = await env.R2_BINDING.get("test-key");
						const value = await obj.text();

						// List objects
						const objects = await env.R2_BINDING.list();

						return new Response(
							JSON.stringify({
								value,
								objects: objects.objects.map(obj => obj.key),
							})
						);
					} catch (e) {
						console.error(e);
						return new Response(String(e), { status: 500 });
					}
				}
			}
			`,
			r2Buckets: {
				R2_BINDING: {
					id: "mixed-mode-r2-bucket-test",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});

		const response = await mf.dispatchFetch("http://example.com");
		const data = await response.json();

		assert.strictEqual(
			data.value,
			"test-value",
			"R2 object content should match what was stored"
		);
		assert.ok(
			data.objects.includes("test-key"),
			"R2 bucket should contain the stored key"
		);
	});

	test.skip("D1 mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			D1_BINDING: {
				type: "d1",
				database_id: "665621c7-e444-4e12-80d4-17db6c3a1f85",
			},
		});

		mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env) {
					try {
						// Create a table
						await env.D1_BINDING.exec(
							"CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)"
						);


						// Query the data
						const result = await env.D1_BINDING.prepare(
							"SELECT * FROM test_table WHERE name = ?"
						)
							.bind("test-value")
							.all();

						return new Response(
							JSON.stringify({
								data: result.results,
								success: result.success,
								meta: result.meta
							})
						);
					} catch (e) {
						console.error(e);
						return new Response(String(e), { status: 500 });
					}
				}
			}
			`,
			d1Databases: {
				D1_BINDING: {
					id: "mixed-mode-test",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});

		const response = await mf.dispatchFetch("http://example.com");
		const data = await response.json();

		assert.strictEqual(data.success, true, "D1 query should be successful");
		assert.ok(Array.isArray(data.data), "D1 should return results as an array");
		assert.ok(
			data.data.some((row) => row.name === "test-value"),
			"D1 should return inserted data"
		);
	});

	test.skip("Vectorize mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			VECTORIZE_BINDING: {
				type: "vectorize",
				index_name: "well-known-vectorize",
			},
		});

		mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
			export default {
				async fetch(request, env, ctx) {
					const url = new URL(request.url)
					if(url.pathname === "/insert") {
						await env.VECTORIZE_BINDING.insert([{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"Peter Piper picked a peck of pickled peppers"}}]);
						await env.VECTORIZE_BINDING.insert([{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"She sells seashells by the sea"}}]);
						await env.VECTORIZE_BINDING.upsert([{"id":"b0daca4a-ffd8-4865-926b-e24800af2a2d","values":[0.2331,1.0125,0.6131,0.9421,0.9661,0.8121,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"metadata":{"text":"She sells seashells by the seashore"}}]);
						return new Response("inserted")
					}
					if(url.pathname === "/query") {
						let response = "";
						response += JSON.stringify(await env.VECTORIZE_BINDING.getByIds(["a44706aa-a366-48bc-8cc1-3feffd87d548"]));

						const queryVector = [
							0.13, 0.25, 0.44, 0.53, 0.62, 0.41, 0.59, 0.68, 0.29, 0.82, 0.37, 0.5,
							0.74, 0.46, 0.57, 0.64, 0.28, 0.61, 0.73, 0.35, 0.78, 0.58, 0.42, 0.32,
							0.77, 0.65, 0.49, 0.54, 0.31, 0.29, 0.71, 0.57,
						]; // vector of dimension 32
						const matches = await env.VECTORIZE_BINDING.query(queryVector, {
							topK: 3,
							returnValues: true,
							returnMetadata: "all",
						});

						return new Response(response);
					}
				}
			}
			`,
			vectorize: {
				VECTORIZE_BINDING: {
					index_name: "well-known-vectorize",
					mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
				},
			},
		});

		await mf.dispatchFetch("http://example.com/insert");
		const response = await mf.dispatchFetch("http://example.com/query");
		const data = await response.text();

		assert.strictEqual(
			data,
			`[{"id":"a44706aa-a366-48bc-8cc1-3feffd87d548","namespace":null,"metadata":{"text":"Peter Piper picked a peck of pickled peppers"},"values":[0.2321,0.8121,0.6315,0.6151,0.4121,0.1512,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]`
		);
	});

	test("Images mixed mode binding", async () => {
		mixedModeSession = await experimental_startMixedModeSession({
			IMAGES: {
				type: "images",
			},
		});

		mf = new Miniflare({
			compatibilityDate: "2025-01-01",
			modules: true,
			script: /* javascript */ `
				export default {
					async fetch(request, env) {
						const image = await fetch(
							"https://playground.devprod.cloudflare.dev/workers-logo.svg"
						);
						const info = await env.IMAGES.info(image.body);
						return Response.json(info)
					}
				}
			`,
			images: {
				binding: "IMAGES",
				mixedModeConnectionString: mixedModeSession.mixedModeConnectionString,
			},
		});
		assert.match(
			await (await mf.dispatchFetch("http://example.com")).text(),
			/\{"format":"image\/svg\+xml"\}/
		);
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
