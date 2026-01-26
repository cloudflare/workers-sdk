import { rm, writeFile } from "node:fs/promises";
import { describe, expect, onTestFinished, test, vi } from "vitest";
import {
	fetchJson,
	isBuildAndPreviewOnWindows,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

const packageManagers = ["pnpm", "npm", "yarn"] as const;
const commands = ["dev", "buildAndPreview"] as const;

describe("basic e2e tests", () => {
	describe.each(packageManagers)('with "%s" package manager', async (pm) => {
		const projectPath = seed("basic", { pm });

		describe.each(commands)('with "%s" command', (command) => {
			test.skipIf(isBuildAndPreviewOnWindows(command))(
				"can serve a Worker that uses a Node.js API (crypto)",
				async () => {
					const proc = await runLongLived(pm, command, projectPath);
					const url = await waitForReady(proc);
					expect(await fetchJson(url + "/api/")).toEqual({
						name: "Cloudflare",
					});
				}
			);

			// Aborting requests doesn't trigger the abort event listener on Windows at the moment
			// See https://github.com/cloudflare/workerd/pull/5062
			test.skipIf(process.platform === "win32")(
				"can listen to abort signals on the request",
				async () => {
					const proc = await runLongLived(pm, command, projectPath);
					const url = await waitForReady(proc);

					// Check that no request has been aborted yet
					const response = await fetch(url + "/aborted");
					await expect(response.text()).resolves.toEqual("Request not aborted");

					// Send a request that we will abort after 1 second
					await Promise.allSettled([
						fetch(url + "/wait", {
							signal: AbortSignal.timeout(1000),
						}),
					]);

					await vi.waitFor(
						async () => {
							const response = await fetch(url + "/aborted");
							await expect(response.text()).resolves.toEqual("Request aborted");
						},
						{ timeout: 10000 }
					);
				}
			);

			describe.skipIf(isBuildAndPreviewOnWindows(command))(
				"environment variables",
				() => {
					test("can read vars from wrangler configuration and .env", async () => {
						await writeFile(
							projectPath + "/.env",
							"SECRET_A=dev-1\nSECRET_B=dev-2"
						);
						onTestFinished(async () => {
							await rm(projectPath + "/.env");
						});
						const proc = await runLongLived(pm, command, projectPath);
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							SECRET_A: "dev-1",
							SECRET_B: "dev-2",
							VAR_1: "var-1",
						});
					});

					test("will not load local dev vars from .env if there is a .dev.vars file", async () => {
						await writeFile(
							projectPath + "/.env",
							"SECRET_A=dot-env-1\nSECRET_B=dot-env-2"
						);
						await writeFile(
							projectPath + "/.dev.vars",
							"SECRET_A=dev-dot-vars-1"
						);
						onTestFinished(async () => {
							await rm(projectPath + "/.env");
							await rm(projectPath + "/.dev.vars");
						});
						const proc = await runLongLived(pm, command, projectPath);
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							SECRET_A: "dev-dot-vars-1",
							VAR_1: "var-1",
						});
					});

					test("will not load local dev vars from .env if CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is set to false", async () => {
						await writeFile(
							projectPath + "/.env",
							"SECRET_A=dot-env-1\nSECRET_B=dot-env-2"
						);
						onTestFinished(async () => {
							await rm(projectPath + "/.env");
						});
						const proc = await runLongLived(pm, command, projectPath, {
							CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
						});
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							VAR_1: "var-1",
						});
					});

					test("can merge vars from wrangler configuration, .env, and .env.local", async () => {
						await writeFile(
							projectPath + "/.env",
							"SECRET_A=dev-1\nSECRET_B=dev-2"
						);
						await writeFile(
							projectPath + "/.env.local",
							"SECRET_A=local-dev-1"
						);
						onTestFinished(async () => {
							await rm(projectPath + "/.env");
							await rm(projectPath + "/.env.local");
						});
						const proc = await runLongLived(pm, command, projectPath);
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							SECRET_A: "local-dev-1",
							SECRET_B: "dev-2",
							VAR_1: "var-1",
						});
					});

					test("can merge vars from wrangler configuration, .env, and .env.local, and environment specific files", async () => {
						await writeFile(
							projectPath + "/.env",
							"SECRET_A=dev-1\nSECRET_B=dev-2"
						);
						await writeFile(
							projectPath + "/.env.local",
							"SECRET_A=local-dev-1"
						);
						await writeFile(
							projectPath + "/.env.staging",
							"SECRET_B=staging-2\nSECRET_C=staging-3"
						);
						await writeFile(
							projectPath + "/.env.staging.local",
							"SECRET_C=local-staging-3"
						);
						onTestFinished(async () => {
							await rm(projectPath + "/.env");
							await rm(projectPath + "/.env.local");
							await rm(projectPath + "/.env.staging");
							await rm(projectPath + "/.env.staging.local");
						});
						const proc = await runLongLived(pm, command, projectPath, {
							CLOUDFLARE_ENV: "staging",
						});
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							SECRET_A: "local-dev-1",
							SECRET_B: "staging-2",
							SECRET_C: "local-staging-3",
							VAR_1: "var-1",
						});
					});

					test("can read vars from process.env if CLOUDFLARE_INCLUDE_PROCESS_ENV is set", async () => {
						const proc = await runLongLived(pm, command, projectPath, {
							CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
						});
						const url = await waitForReady(proc);
						expect(await fetchJson(url + "/env/")).toMatchObject({
							CLOUDFLARE_INCLUDE_PROCESS_ENV: "true", // this proves we read the process.env
						});
					});
				}
			);
		});
	});
});
