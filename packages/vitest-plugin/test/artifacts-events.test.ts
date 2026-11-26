import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("Workers Vitest starts Workflows from native Artifacts event triggers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({ config: true }),
		"cloudflare.config.ts": dedent`
			export default { worker: {
				name: "artifacts-test-worker", entrypoint: "./index.ts",
				compatibilityDate: "2026-09-03",
				env: {
					REPOS: { type: "artifacts", namespace: "examples" },
					EVENTS: { type: "kv" },
				},
				exports: { OnEvent: { type: "workflow", name: "on-event", events: [{
					type: "cf.artifacts.repo.created", filter: { namespace: "examples" },
				}] } },
			} };
		`,
		"index.ts": dedent`
			import { WorkflowEntrypoint } from "cloudflare:workers";
			export class OnEvent extends WorkflowEntrypoint {
				async run(event, step) {
					await step.do("record", async () => {
						await this.env.EVENTS.put("event", JSON.stringify(event.payload));
						return "recorded";
					});
				}
			}
			export default { fetch() { return new Response("ok"); } };
		`,
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it, vi } from "vitest";
			it("delivers a repository event to the configured Workflow", async ({ expect }) => {
				await env.REPOS.create("demo");
				await vi.waitFor(async () => {
					expect(await env.EVENTS.get("event", "json")).toMatchObject({
						type: "cf.artifacts.repo.created",
						source: { namespace: "examples", repoName: "demo" },
					});
				}, { timeout: 5000 });
			});
		`,
	});
	const result = await vitestRun();
	await expect(result.exitCode, result.stderr).resolves.toBe(0);
});
