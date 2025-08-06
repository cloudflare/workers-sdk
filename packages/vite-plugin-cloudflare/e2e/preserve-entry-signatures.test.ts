import { describe, test } from "vitest";
import { fetchJson, runLongLived, seed, waitForReady } from "./helpers.js";

const isWindows = process.platform === "win32";
const packageManagers = ["pnpm", "npm", "yarn"] as const;
const commands = ["dev", "buildAndPreview"] as const;

describe("preserve entry signatures e2e tests", () => {
	describe.each(packageManagers)('with "%s" package manager', async (pm) => {
		const projectPath = seed("preserve-entry-signatures", pm);

		describe.each(commands)('with "%s" command', (command) => {
			test.skipIf(isWindows && command === "buildAndPreview")(
				"can serve a Worker with dynamic imports and preserveEntrySignatures: 'strict'",
				async ({ expect }) => {
					const proc = await runLongLived(pm, command, projectPath);
					const url = await waitForReady(proc);

					const response = await fetchJson(url);
					expect(response).toEqual({ message: "Worker running", A: 1 });

					const apiResponse = await fetchJson(url + "/api/test");
					expect(apiResponse).toEqual({
						message: "Dynamic import executed successfully",
						A: 1,
					});

					expect(proc.stderr).not.toContain("TypeError");
					expect(proc.stderr).not.toContain("export");
				}
			);
		});
	});
});
