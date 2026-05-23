import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

vi.unmock("undici");

describe("hello-world", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("local", () => {
		it("should support get and set local storage", async ({ expect }) => {
			await runWrangler("hello-world get");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Getting value...
				Value not found"
			`);

			await runWrangler(`hello-world set "hello world"`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Getting value...
				Value not found

				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Updating value...
				Updated"
			`);

			await runWrangler("hello-world get");
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Getting value...
				Value not found

				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Updating value...
				Updated

				 ⛅️ wrangler x.x.x
				──────────────────
				👋 Getting value...
				hello world"
			`);
		});
	});
});
