import assert from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	fetchJson,
	isBuildAndPreviewOnWindows,
	runCommand,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

const commands = ["dev", "buildAndPreview"] as const;

if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
	describe.skip("Skipping remote bindings tests without account credentials.");
} else {
	describe
		// Note: the reload test applies changes to the fixture files, so we do want the
		//       tests to run sequentially in order to avoid race conditions
		.sequential("remote bindings tests", () => {
			const replacements = {
				"<<REMOTE_WORKER_PLACEHOLDER>>": `preserve-e2e-vite-remote`,
				"<<REMOTE_WORKER_PLACEHOLDER_ALT>>": `preserve-e2e-vite-remote-alt`,
			};

			const projectPath = seed("remote-bindings", { pm: "pnpm", replacements });

			beforeAll(async () => {
				try {
					assert(
						(
							await fetch(
								"https://preserve-e2e-vite-remote.devprod-testing7928.workers.dev/"
							)
						).status !== 404
					);
				} catch (e) {
					runCommand(`npx wrangler deploy`, `${projectPath}/remote-worker`);
				}
				try {
					assert(
						(
							await fetch(
								"https://preserve-e2e-vite-remote-alt.devprod-testing7928.workers.dev/"
							)
						).status !== 404
					);
				} catch {
					runCommand(`npx wrangler deploy`, `${projectPath}/remote-worker-alt`);
				}
			}, 35_000);

			describe.each(commands)('with "%s" command', (command) => {
				test.skipIf(isBuildAndPreviewOnWindows(command))(
					"can fetch from both local (/auxiliary) and remote workers",
					async () => {
						const proc = await runLongLived("pnpm", command, projectPath);
						const url = await waitForReady(proc);
						expect(await fetchJson(url)).toEqual({
							localWorkerResponse: {
								remoteWorkerResponse: "Hello from an alternative remote worker",
							},
							remoteWorkerResponse: "Hello from a remote worker",
						});
					}
				);

				// This test checks that wrapped bindings (e.g. AI) which rely on additional workers with an authed connection to the CF API work
				test.skipIf(isBuildAndPreviewOnWindows(command))(
					"Wrapped bindings (e.g. Workers AI) can serve a request",
					async () => {
						const proc = await runLongLived("pnpm", command, projectPath);
						const url = await waitForReady(proc);

						expect(await fetchJson(url + "/ai/")).toEqual({
							response: expect.stringContaining("Workers AI"),
						});
					}
				);
			});

			test("reflects changes applied during dev", async () => {
				const proc = await runLongLived("pnpm", "dev", projectPath);
				const url = await waitForReady(proc);
				expect(await fetchJson(url)).toEqual({
					localWorkerResponse: {
						remoteWorkerResponse: "Hello from an alternative remote worker",
					},
					remoteWorkerResponse: "Hello from a remote worker",
				});

				const entryWorkerPath = `${projectPath}/entry-worker/src/index.ts`;
				const entryWorkerContent = await readFile(entryWorkerPath, "utf8");

				await writeFile(
					entryWorkerPath,
					entryWorkerContent
						.replace(
							"localWorkerResponse: await",
							"localWorkerResponseJson: await"
						)
						.replace(
							"remoteWorkerResponse: await",
							"remoteWorkerResponseText: await"
						),
					"utf8"
				);

				await setTimeout(500);

				await vi.waitFor(
					async () => {
						expect(await fetchJson(url)).toEqual({
							localWorkerResponseJson: {
								remoteWorkerResponse: "Hello from an alternative remote worker",
							},
							remoteWorkerResponseText: "Hello from a remote worker",
						});
					},
					{ timeout: 5_000, interval: 250 }
				);

				await writeFile(entryWorkerPath, entryWorkerContent, "utf8");

				await vi.waitFor(
					async () => {
						expect(await fetchJson(url)).toEqual({
							localWorkerResponse: {
								remoteWorkerResponse: "Hello from an alternative remote worker",
							},
							remoteWorkerResponse: "Hello from a remote worker",
						});
					},
					{ timeout: 5_000, interval: 250 }
				);
			});
		});

	describe("remote bindings without actually establishing a remote connection", () => {
		const projectPath = seed("remote-bindings-config-account-id", {
			pm: "pnpm",
		});

		test("for connection to remote bindings during dev the account_id present in the wrangler config file is used", async () => {
			const proc = await runLongLived("pnpm", "dev", projectPath);
			await vi.waitFor(
				async () => {
					expect(proc.stderr).toMatch(
						// Note: this error message shows that we're attempting to establish the remote proxy connection
						//       using the "not-a-valid-account-id-abc" account id
						/A request to the Cloudflare API \(\/accounts\/not-a-valid-account-id-abc\/.*?\) failed/
					);
				},
				{
					timeout: 10_000,
				}
			);
		});
	});

	describe("failure to connect to remote bindings", () => {
		const projectPath = seed("remote-bindings-incorrect-r2-config", {
			pm: "pnpm",
		});

		describe.each(commands)('with "%s" command', (command) => {
			// On Windows the path for the miniflare dependency gets pretty long and this fails in node < 22.7
			// (see: https://github.com/shellscape/jsx-email/issues/225#issuecomment-2420567832), so
			// we need to skip this on windows since in CI we're using node 20
			// we should look into re-enable this once we can move to a node a newer version of node
			test.skipIf(process.platform === "win32")(
				"exit with a non zero error code and log an error",
				async () => {
					const proc = await runLongLived("pnpm", command, projectPath);

					expect(await proc.exitCode).not.toBe(0);
					expect(proc.stderr).toContain(
						"R2 bucket 'non-existent-r2-bucket' not found. Please use a different name and try again. [code: 10085]"
					);
					expect(proc.stderr).toContain(
						"Error: Failed to start the remote proxy session. There is likely additional logging output above."
					);
				}
			);
		});
	});
}

describe("remote bindings disabled", () => {
	const projectPath = seed("remote-bindings-disabled", { pm: "pnpm" });

	describe.each(commands)('with "%s" command', (command) => {
		// On Windows the path for the miniflare dependency gets pretty long and this fails in node < 22.7
		// (see: https://github.com/shellscape/jsx-email/issues/225#issuecomment-2420567832), so
		// we need to skip this on windows since in CI we're using node 20
		// we should look into re-enable this once we can move to a node a newer version of node
		test.skipIf(process.platform === "win32")(
			"cannot connect to remote bindings",
			async () => {
				const proc = await runLongLived("pnpm", command, projectPath);
				const url = await waitForReady(proc);

				const response = await fetch(url);

				const responseText = await response.text();

				expect(responseText).toContain("Error");
				expect(responseText).toContain("Binding AI needs to be run remotely");
			}
		);
	});
});
