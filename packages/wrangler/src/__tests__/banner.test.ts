import { beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";

describe("wrangler banner", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(true);
	});

	it("should display the version banner by default", async ({ expect }) => {
		await runWrangler("--version");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────"
		`);
	});

	it("should hide the version banner when WRANGLER_HIDE_BANNER is present", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_HIDE_BANNER", "true");
		await runWrangler("--version");

		expect(std.out).toMatchInlineSnapshot(`""`);
	});

	it("should not hide the version banner when WRANGLER_HIDE_BANNER=false", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_HIDE_BANNER", "false");
		await runWrangler("--version");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────"
		`);
	});
});
