import { describe, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { Ai } from "@cloudflare/workers-types/experimental";

describe("getPlatformProxy - remote bindings with remoteBindings: false", () => {
	test("getPlatformProxy works with remote bindings", async ({ expect }) => {
		const { env, dispose } = await getPlatformProxy<{
			AI: Ai;
		}>({
			configPath: "./wrangler.remote-bindings-false.jsonc",
			remoteBindings: false,
		});

		await expect(
			env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
				messages: [],
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Binding AI needs to be run remotely]`
		);

		await dispose();
	});
});
