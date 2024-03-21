import { version } from "./../../package.json";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";

describe("version", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	// We cannot test output of version banner,
	// as it is disabled in jest environments

	// it("should output version banner", async () => {
	// 	await runWrangler("-v");
	// 	expect(std.out).toMatchInlineSnapshot(`
	// 	" ⛅️ wrangler 2.0.22
	// 	[38;5;214m--------------------[39m"
	// `);
	// });

	it("should output current version if !isTTY calling with `-v` flag", async () => {
		setIsTTY(false);

		await runWrangler("-v");
		expect(std.out).toMatch(version);
		expect(std.warn).toBe("");
	});

	// This run separately as command handling is different
	it("should output current version if !isTTY calling with `--version` flag", async () => {
		setIsTTY(false);

		await runWrangler("--version");
		expect(std.out).toMatch(version);
		expect(std.warn).toBe("");
	});

	it("should output current version if !isTTY calling (deprecated) `version` command", async () => {
		setIsTTY(false);

		await expect(runWrangler("version")).rejects.toMatchInlineSnapshot(
			`[Error: The \`wrangler version\` command has been removed. You can run \`wrangler --version\` to get the Wrangler version or \`wrangler versions --help\` for Worker Versions subcommands.]`
		);
		expect(std.out).not.toMatch(version);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});
});
