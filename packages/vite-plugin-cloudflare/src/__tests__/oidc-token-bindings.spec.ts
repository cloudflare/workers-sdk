import * as fs from "node:fs/promises";
import { cloudflare } from "@cloudflare/vite-plugin";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { describe, test } from "vitest";

describe("OIDC token bindings through Vite", () => {
	runInTempDir();

	async function createFixture(audience = "https://api.example.com") {
		const bindings = [
			{ binding: "API_TOKEN", audience },
			{
				binding: "RSA_TOKEN",
				audience: "api://token-exchange",
				alg: "RS256",
			},
		];
		await seed({
			"wrangler.json": JSON.stringify({
				name: "oidc-tokens",
				main: "worker.js",
				compatibility_date: "2026-11-25",
				oidc_tokens: bindings,
			}),
			"worker.js": `export default {
				async fetch(request, env) {
					return new Response(await env.API_TOKEN.getToken());
				}
			};`,
		});
		return bindings;
	}

	function createViteBuilder() {
		return createBuilder({
			root: process.cwd(),
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					viteEnvironment: { name: "ssr" },
				}),
			],
		});
	}

	test("preserves OIDC audiences and algorithms in the deployable Worker config", async ({
		expect,
	}) => {
		const bindings = await createFixture();
		const builder = await createViteBuilder();
		await builder.buildApp();
		const output: { oidc_tokens?: unknown } = JSON.parse(
			await fs.readFile("dist/ssr/wrangler.json", "utf8")
		);
		expect(output.oidc_tokens).toEqual(bindings);
	});

	test("rejects an invalid OIDC audience when configuring the Vite build", async ({
		expect,
	}) => {
		await createFixture("https://api.example.com ");
		await expect(createViteBuilder()).rejects.toThrow(
			/printable ASCII characters with no whitespace/
		);
	});
});
