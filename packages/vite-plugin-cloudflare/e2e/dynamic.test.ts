import { describe } from "vitest";
import { fetchJson, test, waitForReady } from "./helpers.js";

describe("prebundling Node.js compatibility", () => {
	describe.each(["pnpm", "npm", "yarn"])("using %s", (pm) => {
		test("will not cause a reload on a dynamic import of a Node.js module", async ({
			expect,
			seed,
			viteDev,
		}) => {
			const projectPath = await seed("dynamic", pm);

			const proc = await viteDev(projectPath);
			const url = await waitForReady(proc);
			expect(await fetchJson(url)).toEqual("OK!");
			expect(proc.stdout).not.toContain(
				"optimized dependencies changed. reloading"
			);
			expect(proc.stdout).not.toContain("[vite] program reload");
		});
	});
});
