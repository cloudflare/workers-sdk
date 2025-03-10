import { describe } from "vitest";
import { fetchJson, runCommand, test, waitForReady } from "./helpers.js";

const packageManagers = ["pnpm", "npm", "yarn"] as const;
const commands = ["dev", "preview"] as const;

describe("basic e2e tests", () => {
	describe.each(packageManagers)('with "%s" package manager', (pm) => {
		describe.each(commands)('with "%s" command', (command) => {
			describe("node compatibility", () => {
				test("can serve a Worker request", async ({
					expect,
					seed,
					viteCommand,
				}) => {
					const projectPath = await seed("basic");
					runCommand(`${pm} install`, projectPath);

					const proc = await viteCommand(pm, command, projectPath);
					const url = await waitForReady(proc);
					expect(await fetchJson(url + "/api/")).toEqual({
						name: "Cloudflare",
					});
				});
			});

			// This test checks that wrapped bindings which rely on additional workers with an authed connection to the CF API work
			describe("Workers AI", () => {
				test("can serve a Worker request", async ({
					expect,
					seed,
					viteCommand,
				}) => {
					const projectPath = await seed("basic");
					runCommand(`${pm} install`, projectPath);

					const proc = await viteCommand(pm, command, projectPath);
					const url = await waitForReady(proc);

					expect(await fetchJson(url + "/ai/")).toEqual({
						response: expect.stringContaining("Workers AI"),
					});
				});
			});
		});
	});
});
