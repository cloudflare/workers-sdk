import { vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

vi.unmock("undici");

describe("hello-world", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("local", () => {
		it("should support get and set local storage", async () => {
			await runWrangler("hello-world get");
			expect(std.out).toMatchInlineSnapshot(`
				"👋 Getting value...
				Value not found"
			`);

			await runWrangler(`hello-world set "hello world"`);
			expect(std.out).toMatchInlineSnapshot(`
				"👋 Getting value...
				Value not found
				👋 Updating value...
				Updated"
			`);

			await runWrangler("hello-world get");
			expect(std.out).toMatchInlineSnapshot(`
				"👋 Getting value...
				Value not found
				👋 Updating value...
				Updated
				👋 Getting value...
				hello world"
			`);
		});
	});
});
