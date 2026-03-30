import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("hello_world support", async ({ expect, seed, vitestRun }) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
			{
				"name": "test-worker",
				"compatibility_date": "2025-12-02",
				"compatibility_flags": ["nodejs_compat"],
				"unsafe_hello_world": [
					{
						"binding": "HELLO_WORLD",
					}
				]
			}
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const value = Math.floor(Date.now() * Math.random()).toString(36);
					await env.HELLO_WORLD.set(value);

					const result = await env.HELLO_WORLD.get();
					if (value !== result.value) {
						return new Response("Value mismatch", { status: 500 });
					}

					return new Response('ok');
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("works", async () => {
				const request = new Request("http://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("ok");
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
});

test("adminSecretsStore seeds and reads secrets", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
				{
					"name": "test-worker",
					"compatibility_date": "2025-12-02",
					"compatibility_flags": ["nodejs_compat"],
					"secrets_store_secrets": [
						{
							"binding": "MY_SECRET",
							"secret_name": "my-secret",
							"store_id": "aaaabbbbccccdddd0000000000000000"
						}
					]
				}
			`,
		"index.test.ts": dedent`
				import { adminSecretsStore } from "cloudflare:test";
				import { env } from "cloudflare:workers";
				import { it } from "vitest";

				it("create, update, list, and delete a secret", async ({ expect }) => {
					const admin = adminSecretsStore(env.MY_SECRET);

					// create
					const id = await admin.create("initial-value");
					expect(typeof id).toBe("string");
					expect(await env.MY_SECRET.get()).toBe("initial-value");

					// update
					await admin.update("updated-value", id);
					expect(await env.MY_SECRET.get()).toBe("updated-value");

					// list
					const secrets = await admin.list();
					expect(secrets.length).toBeGreaterThan(0);

					// delete
					await admin.delete(id);
					try {
						await env.MY_SECRET.get();
						expect.unreachable("expected get() to throw after delete");
					} catch (e) {
						expect(String(e)).toContain("not found");
					}
				});
			`,
	});

	const result = await vitestRun();
	await expect(result.exitCode).resolves.toBe(0);
});
