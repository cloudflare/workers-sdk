import dedent from "ts-dedent";
import { expect } from "vitest";
import { test } from "./helpers";

test("parallel tests should be limited by available of parallelism", async ({
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.ts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			import os from "node:os";

			// Override the available parallelism to force the Workers pool
			// to limit the number of concurrent test runs.
			// We need to do this here so that it overrides it the correct process.
			os.availableParallelism = () => 2;

			export default defineWorkersConfig({
				test: {
					testTimeout: 10_000,
					poolOptions: {
						workers: {
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});`,
		"index1.test.ts": dedent`
			import { it } from "vitest";
			it("does something", async () => {
				console.log("start 1");
				await (new Promise((res) => setTimeout(res, 500)));
				console.log("end 1");
			});`,
		"index2.test.ts": dedent`
			import { it } from "vitest";
			it("does something", async () => {
				console.log("start 2");
				await (new Promise((res) => setTimeout(res, 500)));
				console.log("end 2");
			});`,
		"index3.test.ts": dedent`
			import { it } from "vitest";
			it("does something", async () => {
				console.log("start 3");
				await (new Promise((res) => setTimeout(res, 500)));
				console.log("end 3");
			});`,
		"index4.test.ts": dedent`
			import { it } from "vitest";
			it("does something", async () => {
				console.log("start 4");
				await (new Promise((res) => setTimeout(res, 500)));
				console.log("end 4");
			});`,
	});
	const result = await vitestRun();
	const logs = result.stdout
		.split("\n")
		.filter((l) => l.startsWith("start") || l.startsWith("end"));
	// Ensure that both 1 and 2 finish before 3 and 4 start
	expect(logs.indexOf("end 1")).toBeLessThan(logs.indexOf("start 3"));
	expect(logs.indexOf("end 2")).toBeLessThan(logs.indexOf("start 3"));
	expect(logs.indexOf("end 1")).toBeLessThan(logs.indexOf("start 4"));
	expect(logs.indexOf("end 2")).toBeLessThan(logs.indexOf("start 4"));
});
