import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";
import { describe, expect, test } from "vitest";
import { cloudflare } from "../index";

const fixturesPath = fileURLToPath(
	new URL("./fixtures/build-app", import.meta.url)
);

describe("createBuildApp", () => {
	// https://github.com/cloudflare/workers-sdk/issues/16530
	test("does not rebuild an environment another plugin's buildApp already built", async () => {
		const builder = await createBuilder({
			root: fixturesPath,
			logLevel: "silent",
			plugins: [
				{
					name: "framework-like-plugin",
					// Simulates a framework plugin that builds the client
					// environment before the Worker, like `@solidjs/vite-plugin`
					// with `start: true`.
					buildApp: {
						order: "pre",
						async handler(viteBuilder) {
							await viteBuilder.build(viteBuilder.environments.client);
						},
					},
				},
				cloudflare({ inspectorPort: false, persistState: false }),
			],
		});

		const buildCounts = new Map<string, number>();
		const originalBuild = builder.build.bind(builder);
		builder.build = async (environment) => {
			buildCounts.set(
				environment.name,
				(buildCounts.get(environment.name) ?? 0) + 1
			);

			return originalBuild(environment);
		};

		await builder.buildApp();

		expect(buildCounts.get("client")).toBe(1);
		expect(buildCounts.get("ssr")).toBe(1);
	});
});
