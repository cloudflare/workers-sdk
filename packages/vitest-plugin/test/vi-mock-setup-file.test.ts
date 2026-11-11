import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/10201
test(
	"vi.mock() applies to modules imported by the main Worker when a setup file imports from cloudflare:test",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(
				{ main: "./index.ts" },
				{ setupFiles: ["./setup.ts"] }
			),
			"dep.ts": dedent /* javascript */ `
				export function getValue() {
					return "real";
				}
			`,
			"index.ts": dedent /* javascript */ `
				import { getValue } from "./dep";
				export default {
					fetch() {
						return new Response(getValue());
					},
				};
			`,
			"setup.ts": dedent /* javascript */ `
				import { env } from "cloudflare:test";
				void env;
			`,
			"index.test.ts": dedent /* javascript */ `
				import { SELF } from "cloudflare:test";
				import { it, expect, vi } from "vitest";

				vi.mock("./dep", () => ({ getValue: () => "mocked" }));

				it("uses the mocked module", async () => {
					const response = await SELF.fetch("https://example.com/");
					expect(await response.text()).toBe("mocked");
				});
			`,
		});
		const result = await vitestRun();
		expect(result.stdout).toMatch("1 passed");
		expect(await result.exitCode).toBe(0);
	}
);
