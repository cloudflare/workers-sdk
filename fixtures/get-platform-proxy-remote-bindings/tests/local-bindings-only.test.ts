import { describe, expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { Ai } from "@cloudflare/workers-types/experimental";

describe(
	"getPlatformProxy - remote bindings with localBindingsOnly",
	{ timeout: 50_000 },
	() => {
		test("getPlatformProxy works with remote bindings", async () => {
			const { env, dispose } = await getPlatformProxy<{
				AI: Ai;
			}>({
				configPath: "./wrangler.local-bindings-only.jsonc",
				localBindingsOnly: true,
			});

			await expect(
				(async () => {
					await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
						messages: [],
					});
				})()
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Binding AI needs to be run remotely]`
			);

			await dispose();
		});
	}
);
