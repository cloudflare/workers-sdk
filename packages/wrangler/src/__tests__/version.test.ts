import { mockConsoleMethods, replaceVersion } from "./helpers/mock-console";
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

	it("should output current version if !isTTY", async () => {
		setIsTTY(false);

		await runWrangler("-v");
		expect(replaceVersion(std.out)).toMatchInlineSnapshot(`"x.x.x"`);
	});
});
