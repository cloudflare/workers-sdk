import { describe, test } from "vitest";
import {
	fetchJson,
	isBuildAndPreviewOnWindows,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

const packageManagers = ["pnpm", , "npm", "yarn"] as const;
const commands = ["dev", "buildAndPreview"] as const;

describe("basic e2e tests", () => {
	describe.each(packageManagers)('with "%s" package manager', async (pm) => {
		const projectPath = seed("basic", pm);

		describe.each(commands)('with "%s" command', (command) => {
			describe("node compatibility", () => {
				test.skipIf(isBuildAndPreviewOnWindows(command))(
					"can serve a Worker request",
					async ({ expect }) => {
						const proc = await runLongLived(pm, command, projectPath);
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/api/")).toEqual({
							name: "Cloudflare",
						});
					}
				);
			});

			// This test checks that wrapped bindings which rely on additional workers with an authed connection to the CF API work
			// They are skipped if you have not provided the necessary account id and api token.
			describe.skipIf(
				!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN
			)("Workers AI", () => {
				test.skipIf(isBuildAndPreviewOnWindows(command))(
					"can serve a Worker request",
					async ({ expect }) => {
						const proc = await runLongLived(pm, command, projectPath);
						const url = await waitForReady(proc);

						expect(await fetchJson(url + "/ai/")).toEqual({
							response: expect.stringContaining("Workers AI"),
						});
					}
				);
			});
		});
	});
});
