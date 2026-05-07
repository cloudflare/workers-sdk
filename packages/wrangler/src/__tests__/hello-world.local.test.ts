import { describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
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
				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Getting value...
				Value not found"
			`);

			await runWrangler(`hello-world set "hello world"`);
			expect(std.out).toMatchInlineSnapshot(`
				"
				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Getting value...
				Value not found

				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Updating value...
				Updated"
			`);

			await runWrangler("hello-world get");
			expect(std.out).toMatchInlineSnapshot(`
				"
				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Getting value...
				Value not found

				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Updating value...
				Updated

				⛅️ wrangler · vx.x.x
				────────────────────
				👋 Getting value...
				hello world"
			`);
		});
	});
});
