import { describe } from "vitest";
import { fetchJson, runCommand, test, waitForReady } from "./helpers.js";

describe("node compatibility", () => {
	describe.each(["pnpm --no-store", "npm", "yarn"])("using %s", (pm) => {
		test("can serve a Worker request", async ({ expect, seed, viteDev }) => {
			const projectPath = await seed("basic");
			runCommand(`${pm} install`, projectPath);

			const proc = await viteDev(projectPath);
			const url = await waitForReady(proc);
			expect(await fetchJson(url + "/api/")).toEqual({ name: "Cloudflare" });
		});
	});
});

// This test checks that wrapped bindings which rely on additional workers with an authed connection to the CF API work
describe("Workers AI", () => {
	test("can serve a Worker request", async ({ expect, seed, viteDev }) => {
		const projectPath = await seed("basic");
		runCommand(`npm install`, projectPath);

		const proc = await viteDev(projectPath);
		const url = await waitForReady(proc);

		expect(await fetchJson(url + "/ai/")).toEqual({
			response: expect.stringContaining("Workers AI"),
		});
	});
});
