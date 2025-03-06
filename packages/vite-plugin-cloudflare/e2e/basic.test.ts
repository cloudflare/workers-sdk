import { describe } from "vitest";
import { fetchJson, runCommand, test, waitForReady } from "./helpers.js";

describe("node compatibility", () => {
	describe.each(["pnpm --no-store", "npm", "yarn"])("using %s", (pm) => {
		test("can serve a Worker request", async ({
			expect,
			seed,
			viteDev,
			vitePreview,
		}) => {
			const projectPath = await seed("basic");
			runCommand(`${pm} install`, projectPath);

			const devProc = await viteDev(projectPath);
			const devUrl = await waitForReady(devProc);
			expect(await fetchJson(devUrl + "/api/")).toEqual({ name: "Cloudflare" });

			const command = pm === "npm" ? `npx` : pm;
			runCommand(`${command} vite build`, projectPath);

			const previewProc = await vitePreview(projectPath);
			const previewUrl = await waitForReady(previewProc);
			expect(await fetchJson(previewUrl + "/api/")).toEqual({
				name: "Cloudflare",
			});
		});
	});
});
