import dedent from "ts-dedent";
import { minimalVitestConfig, test, waitFor } from "./helpers";

test("console.log()s include correct source-mapped locations", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.ts": minimalVitestConfig,
		"index.test.ts": dedent`
			import { describe, it } from "vitest";
			console.log("global");
			describe("thing", () => {
				console.log("describe");
				it("does something", () => {
					console.log("test");
				});
			});
		`,
	});
	const result = vitestDev();
	await waitFor(() => {
		expect(result.stdout).toMatch("stdout | index.test.ts:2:9\nglobal");
		expect(result.stdout).toMatch("stdout | index.test.ts:4:10\ndescribe");
		expect(result.stdout).toMatch(
			"stdout | index.test.ts > thing > does something\ntest"
		);
	});

	// Check still have correct locations on reload
	// TODO(soon): when issue with source map cache not being flushed between reloads,
	//  add a test here to ensure that changing line numbers changes output
	await seed({
		"index.test.ts": dedent`
			import { describe, it } from "vitest";
			console.log("new global");
			describe("new thing", () => {
				console.log("new describe");
				it("does something else", () => {
					console.log("new test");
				});
			});
		`,
	});
	await waitFor(() => {
		expect(result.stdout).toMatch("stdout | index.test.ts:2:9\nnew global");
		expect(result.stdout).toMatch("stdout | index.test.ts:4:10\nnew describe");
		expect(result.stdout).toMatch(
			"stdout | index.test.ts > new thing > does something else\nnew test"
		);
	});
});
