import { describe, it } from "vitest";
import { version } from "./../../package.json";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";

describe("version", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	// We cannot test output of version banner,
	// as it is disabled in testing environments

	// it("should output version banner", async ({ expect }) => {
	// 	await runWrangler("-v");
	// 	expect(std.out).toMatchInlineSnapshot(`
	// 	" ⛅️ wrangler 2.0.22
	// 	[38;5;214m--------------------[39m"
	// `);
	// });

	it("should output current version if !isTTY calling with `-v` flag", async ({
		expect,
	}) => {
		setIsTTY(false);

		await runWrangler("-v");
		expect(std.out).toMatch(version);
		expect(std.warn).toBe("");
	});

	// This run separately as command handling is different
	it("should output current version if !isTTY calling with `--version` flag", async ({
		expect,
	}) => {
		setIsTTY(false);

		await runWrangler("--version");
		expect(std.out).toMatch(version);
		expect(std.warn).toBe("");
	});
});
