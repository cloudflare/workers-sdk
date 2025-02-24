import { describe } from "vitest";
import { fetchJson, runCommand, test, waitForReady } from "./helpers.js";

describe.skip("node compatibility", () => {
	describe.each(["pnpm", "npm", "yarn"])("using %s", (pm) => {
		test("can serve a Worker request", async ({ expect, seed, viteDev }) => {
			const projectPath = await seed("basic");
			runCommand(`${pm} install`, projectPath);

			const proc = await viteDev(projectPath);
			const url = await waitForReady(proc);
			expect(await fetchJson(url + "/api/")).toEqual({ name: "Cloudflare" });
		});
	});
});
