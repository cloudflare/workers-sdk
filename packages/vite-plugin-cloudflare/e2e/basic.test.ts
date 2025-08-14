import { rm, writeFile } from "node:fs/promises";
import { describe, test } from "vitest";
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
		const projectPath = seed("basic", pm);

		describe.each(commands)('with "%s" command', (command) => {
			test.skipIf(isBuildAndPreviewOnWindows(command))(
				"can serve a Worker that uses a Node.js API (crypto)",
				async ({ expect }) => {
					const proc = await runLongLived(pm, command, projectPath);
					const url = await waitForReady(proc);
					expect(await fetchJson(url + "/api/")).toEqual({
						name: "Cloudflare",
					});
				}
			);

			describe.skipIf(isBuildAndPreviewOnWindows(command))(
				"environment variables",
				() => {
					test("can read vars from wrangler configuration and .env", async ({
						expect,
						onTestFinished,
					}) => {
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

					test("will not load local dev vars from .env if there is a .dev.vars file", async ({
						expect,
						onTestFinished,
					}) => {
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

					test("will not load local dev vars from .env if CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV is set to false", async ({
						expect,
						onTestFinished,
					}) => {
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

					test("can merge vars from wrangler configuration, .env, and .env.local", async ({
						expect,
						onTestFinished,
					}) => {
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

					test("can merge vars from wrangler configuration, .env, and .env.local, and environment specific files", async ({
						expect,
						onTestFinished,
					}) => {
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

					test("can read vars from process.env if CLOUDFLARE_INCLUDE_PROCESS_ENV is set", async ({
						expect,
					}) => {
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
