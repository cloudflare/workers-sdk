import dedent from "ts-dedent";
import { test, vitestConfig, waitFor } from "./helpers";

test.skipIf(process.platform === "win32")(
	"console.log()s include correct source-mapped locations",
	async ({ expect, seed, vitestDev }) => {
		await seed({
			"vitest.config.mts": vitestConfig(),
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
			expect(result.stdout).toMatch("stdout | index.test.ts\nglobal");
			expect(result.stdout).toMatch("stdout | index.test.ts\ndescribe");
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
			expect(result.stdout).toMatch("stdout | index.test.ts\nnew global");
			expect(result.stdout).toMatch("stdout | index.test.ts\nnew describe");

			expect(result.stdout).toMatch(
				"stdout | index.test.ts > new thing > does something else\nnew test"
			);
		});
	}
);

test("handles detatched console methods", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig(),
		"index.test.ts": dedent`
			import { SELF } from "cloudflare:test";
			import { expect, it } from "vitest";
			it("does not crash when using a detached console method", async () => {
				const fn = console["debug"];
				fn("Does not crash");
				expect(true).toBe(true);
			});
	`,
	});
	const result = vitestDev();
	expect(result.stderr).toMatch("");
});

test("console.logs() inside `export default`ed handlers with SELF", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			main: "./index.ts",
			singleWorker: true,
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
		"index.ts": dedent`
			export default {
				fetch() {
					console.log("one");
					console.log("two");
					return new Response();
				}
			}
		`,
		"index.test.ts": dedent`
			import { SELF } from "cloudflare:test";
			import { expect, it } from "vitest";
			it("sends request", async () => {
				const response = await SELF.fetch("https://example.com");
				expect(response.ok).toBe(true);
			});
		`,
	});
	const result = await vitestRun();
	console.log(result.stderr);
	expect(result.stdout).toMatch(
		"stdout | index.test.ts > sends request\none\ntwo"
	);
});
