import { version } from "./../../package.json";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runTriangle } from "./helpers/run-triangle";

describe("version", () => {
	const std = mockConsoleMethods();
	const { setIsTTY } = useMockIsTTY();

	// We cannot test output of version banner,
	// as it is disabled in jest environments

	// it("should output version banner", async () => {
	// 	await runTriangle("-v");
	// 	expect(std.out).toMatchInlineSnapshot(`
	// 	" ⛅️ triangle 2.0.22
	// 	[38;5;214m--------------------[39m"
	// `);
	// });

	it("should output current version if !isTTY calling -v", async () => {
		setIsTTY(false);

		await runTriangle("-v");
		expect(std.out).toMatch(version);
	});

	// This run separately as command handling is different
	it("should output current version if !isTTY calling --version", async () => {
		setIsTTY(false);

		await runTriangle("--version");
		expect(std.out).toMatch(version);
	});
});
