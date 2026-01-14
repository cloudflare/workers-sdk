import { describe, expect, test } from "vitest";
import { fetchJson, runLongLived, seed, waitForReady } from "./helpers.js";

const packageManagers = ["pnpm", "npm", "yarn"] as const;

describe("prebundling Node.js compatibility", () => {
	describe.each(packageManagers)('with "%s" package manager', (pm) => {
		const projectPath = seed("dynamic", { pm });

		test("will not cause a reload on a dynamic import of a Node.js module", async () => {
			const proc = await runLongLived(pm, "dev", projectPath);
			const url = await waitForReady(proc);
			expect(await fetchJson(url)).toEqual("OK!");
			expect(proc.stdout).not.toContain(
				"optimized dependencies changed. reloading"
			);
			expect(proc.stdout).not.toContain("[vite] program reload");
		});
	});
});
