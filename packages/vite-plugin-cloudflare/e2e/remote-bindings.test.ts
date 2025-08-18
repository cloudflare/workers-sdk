import assert from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { beforeAll, describe, test, vi } from "vitest";
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

			const projectPath = seed("remote-bindings", "pnpm", replacements);

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
					async ({ expect }) => {
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
			});

			test("reflects changes applied during dev", async ({ expect }) => {
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
}
