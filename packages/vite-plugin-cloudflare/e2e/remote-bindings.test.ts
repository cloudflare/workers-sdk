import assert from "node:assert";
import { randomUUID } from "node:crypto";
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
			const remoteWorkerName = `tmp-e2e-vite-remote-${randomUUID().split("-")[0]}`;
			const remoteAltWorkerName = `tmp-e2e-vite-remote-alt-${randomUUID().split("-")[0]}`;

			const replacements = {
				"<<REMOTE_WORKER_PLACEHOLDER>>": remoteWorkerName,
				"<<REMOTE_WORKER_PLACEHOLDER_ALT>>": remoteAltWorkerName,
			};

			const projectPath = seed("remote-bindings", "pnpm", replacements);

			beforeAll(async () => {
				const deployOut = runCommand(
					`npx wrangler deploy`,
					`${projectPath}/remote-worker`
				);
				const deployedUrl = deployOut.match(
					/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
				)?.groups?.url;
				assert(
					deployedUrl,
					"Failed to find deployed worker URL from " + deployOut
				);

				const altDeployOutput = runCommand(
					`npx wrangler deploy`,
					`${projectPath}/remote-worker-alt`
				);
				const altDeployedUrl = altDeployOutput.match(
					/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
				)?.groups?.url;
				assert(
					altDeployedUrl,
					"Failed to find deployed worker URL from " + altDeployOutput
				);

				// Wait for the workers to become available
				await Promise.all([
					vi.waitFor(
						async () => {
							const response = await fetch(deployedUrl);
							expect(response.status).toBe(200);
						},
						{ timeout: 10_000, interval: 500 }
					),
					vi.waitFor(
						async () => {
							const response = await fetch(altDeployedUrl);
							expect(response.status).toBe(200);
						},
						{ timeout: 10_000, interval: 500 }
					),
				]);

				return () => {
					// Try to clean up the remote workers after tests but give up after a couple of seconds
					// or if the deletion fails.
					runCommand(
						`npx wrangler delete --force`,
						`${projectPath}/remote-worker`,
						{ canFail: true, timeout: 2_000 }
					);
					runCommand(
						`npx wrangler delete --force`,
						`${projectPath}/remote-worker-alt`,
						{ canFail: true, timeout: 2_000 }
					);
				};
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
