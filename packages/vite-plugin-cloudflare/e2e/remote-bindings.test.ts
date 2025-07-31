import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { setTimeout } from "node:timers/promises";
import { afterAll, beforeAll, describe, test, vi } from "vitest";
import {
	fetchJson,
	runCommand,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

const isWindows = os.platform() === "win32";
const commands = ["dev", "buildAndPreview"] as const;

if (
	isWindows ||
	!process.env.CLOUDFLARE_ACCOUNT_ID ||
	!process.env.CLOUDFLARE_API_TOKEN
) {
	describe.skip(
		"Skipping remote bindings tests on Windows or without account credentials."
	);
} else {
	describe
		// Note: the reload test applies changes to the fixture files, so we do want the
		//       tests to run sequentially in order to avoid race conditions
		.sequential("remote bindings tests", () => {
			const replacements = {
				"<<REMOTE_WORKER_PLACEHOLDER>>": `tmp-e2e-vite-remote-${randomUUID().split("-")[0]}`,
				"<<REMOTE_WORKER_PLACEHOLDER_ALT>>": `tmp-e2e-vite-remote-alt-${randomUUID().split("-")[0]}`,
			};

			const projectPath = seed("remote-bindings", "pnpm", replacements);

			beforeAll(() => {
				runCommand(`npx wrangler deploy`, `${projectPath}/remote-worker`);
				runCommand(`npx wrangler deploy`, `${projectPath}/remote-worker-alt`);
			}, 35_000);

			afterAll(() => {
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
			});

			describe.each(commands)('with "%s" command', (command) => {
				test("can fetch from both local (/auxiliary) and remote workers", async ({
					expect,
				}) => {
					const proc = await runLongLived("pnpm", command, projectPath);
					const url = await waitForReady(proc);
					expect(await fetchJson(url)).toEqual({
						localWorkerResponse: {
							remoteWorkerResponse: "Hello from an alternative remote worker",
						},
						remoteWorkerResponse: "Hello from a remote worker",
					});
				});
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
