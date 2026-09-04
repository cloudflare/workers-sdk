import { describe, test } from "vitest";
import { runLongLived, seed, waitForReady } from "./helpers.js";

describe("new Function in Vite dev", () => {
	const projectPath = seed("new-function", { pm: "npm" });

	test("supports new Function in worker modules", async ({ expect }) => {
		const proc = await runLongLived("npm", "dev", projectPath);
		const url = await waitForReady(proc);
		const response = await fetch(url, {
			headers: { "MF-Disable-Pretty-Error": "true" },
		});

		await expect(response.text()).resolves.toBe("new-function-ok");
	});
});
