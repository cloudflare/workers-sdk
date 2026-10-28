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
