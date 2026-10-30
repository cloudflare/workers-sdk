import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("runs a self-named Durable Object and preserves external bindings", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				compatibilityFlags: ["nodejs_compat"],
				durableObjects: {
					EXTERNAL_DO: {
						className: "MyDurableObject",
						scriptName: "other-worker",
					},
				},
				workers: [
					{
						name: "other-worker",
						modules: true,
						compatibilityDate: "2025-09-01",
						durableObjects: { SELF: "MyDurableObject" },
						script: `import { DurableObject } from "cloudflare:workers";
						export class MyDurableObject extends DurableObject { ping() { return "external"; } }
						export default {};`,
					},
				],
			},
		}),
		"wrangler.jsonc": JSON.stringify({
			name: "test-worker",
			main: "./index.ts",
			compatibility_date: "2025-09-01",
			durable_objects: {
				bindings: [
					{
						name: "MY_DO",
						class_name: "MyDurableObject",
						script_name: "test-worker",
					},
				],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["MyDurableObject"] }],
		}),
		"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class MyDurableObject extends DurableObject {
				ping() {
					return this.ctx.storage.sql.exec("SELECT 'pong' AS message").one().message;
				}
			}
			export default { fetch() { return new Response("ok"); } };
		`,
		"index.test.ts": dedent`
			import { env, runInDurableObject } from "cloudflare:test";
			import { it } from "vitest";
			it("calls the local Durable Object", async ({ expect }) => {
				const stub = env.MY_DO.get(env.MY_DO.idFromName("test"));
				expect(await stub.ping()).toBe("pong");
				expect(await runInDurableObject(stub, (instance) => instance.ping())).toBe("pong");
				const external = env.EXTERNAL_DO.get(env.EXTERNAL_DO.idFromName("test"));
				expect(await external.ping()).toBe("external");
			});
		`,
	});

	const result = await vitestRun();
	expect(await result.exitCode, result.stdout + result.stderr).toBe(0);
});

test.for([
	{ label: "generated", environment: {}, scriptName: undefined },
	{
		label: "generated self-reference",
		environment: {},
		scriptName: "alpha-staging",
	},
	{
		label: "explicit self-reference",
		environment: { name: "beta" },
		scriptName: "beta",
	},
])(
	"preserves base Worker targets with $label environment naming",
	async ({ environment, scriptName }, { expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				wrangler: {
					configPath: "./wrangler.jsonc",
					environment: "staging",
				},
				miniflare: {
					compatibilityFlags: ["nodejs_compat"],
					workers: [
						{
							name: "alpha",
							modules: true,
							compatibilityDate: "2025-09-01",
							durableObjects: { SELF: "Counter" },
							script: `import { DurableObject } from "cloudflare:workers";
							export class Counter extends DurableObject { ping() { return "base"; } }
							export default {};`,
						},
					],
				},
			}),
			"wrangler.jsonc": JSON.stringify({
				name: "alpha",
				main: "./index.ts",
				compatibility_date: "2025-09-01",
				migrations: [{ tag: "v1", new_sqlite_classes: ["Counter"] }],
				env: {
					staging: {
						...environment,
						durable_objects: {
							bindings: [
								{
									name: "BASE_DO",
									class_name: "Counter",
									script_name: "alpha",
								},
								{
									name: "MY_DO",
									class_name: "Counter",
									script_name: scriptName,
								},
							],
						},
					},
				},
			}),
			"index.ts": dedent`
				import { DurableObject } from "cloudflare:workers";
				export class Counter extends DurableObject {
					ping() {
						return this.ctx.storage.sql.exec("SELECT 'staging' AS message").one().message;
					}
				}
				export default { fetch() { return new Response("ok"); } };
			`,
			"index.test.ts": dedent`
				import { env, runInDurableObject } from "cloudflare:test";
				import { it } from "vitest";
				it("keeps base and staging namespaces separate", async ({ expect }) => {
					const base = env.BASE_DO.get(env.BASE_DO.idFromName("test"));
					expect(await base.ping()).toBe("base");
					const local = env.MY_DO.get(env.MY_DO.idFromName("test"));
					expect(await local.ping()).toBe("staging");
					expect(await runInDurableObject(local, (instance) => instance.ping())).toBe("staging");
				});
			`,
		});

		const result = await vitestRun();
		expect(await result.exitCode, result.stdout + result.stderr).toBe(0);
	}
);
