import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { assert, beforeAll, describe, onTestFinished, test, vi } from "vitest";
import {
	fetchJson,
	isBuildAndPreviewOnWindows,
	runCommand,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";
import type { RequestListener } from "node:http";

const commands = ["dev", "buildAndPreview"] as const;
const isWindows = process.platform === "win32";
const workersDomain =
	process.env.E2E_ACCOUNT_WORKERS_DEV_DOMAIN ??
	"devprod-testing7928.workers.dev";

async function startMockCloudflareApi(listener: RequestListener) {
	const server = createServer(listener);
	onTestFinished(() => {
		server.close();
		server.closeAllConnections();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert(address && typeof address !== "string");
	return `http://127.0.0.1:${address.port}/client/v4`;
}

// Remote bindings tests are skipped on Windows due to slow/unreliable remote proxy
// session initialization times in CI, which causes intermittent timeout failures.
// See: https://jira.cfdata.org/browse/DEVX-2030
if (isWindows) {
	describe.skip("Skipping remote bindings tests on Windows.");
} else if (
	!process.env.CLOUDFLARE_ACCOUNT_ID ||
	!process.env.CLOUDFLARE_API_TOKEN
) {
	describe.skip("Skipping remote bindings tests without account credentials.");
} else {
	// Note: the reload test applies changes to the fixture files, so we do want the
	//       tests to run sequentially in order to avoid race conditions
	describe("remote bindings tests", { concurrent: false }, () => {
		const replacements = {
			"<<REMOTE_WORKER_PLACEHOLDER>>": `preserve-e2e-vite-remote`,
			"<<REMOTE_WORKER_PLACEHOLDER_ALT>>": `preserve-e2e-vite-remote-alt`,
		};

		const projectPath = seed("remote-bindings", { pm: "pnpm", replacements });

		beforeAll(async () => {
			try {
				assert(
					(await fetch(`https://preserve-e2e-vite-remote.${workersDomain}/`))
						.status !== 404
				);
			} catch {
				runCommand(`npx wrangler deploy`, `${projectPath}/remote-worker`);
			}
			try {
				assert(
					(
						await fetch(
							`https://preserve-e2e-vite-remote-alt.${workersDomain}/`
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

			// This test checks that wrapped bindings (e.g. AI) which rely on additional workers with an authed connection to the CF API work
			test.skipIf(isBuildAndPreviewOnWindows(command))(
				"Wrapped bindings (e.g. Workers AI) can serve a request",
				async ({ expect }) => {
					const proc = await runLongLived("pnpm", command, projectPath);
					const url = await waitForReady(proc);

					expect(await fetchJson(url + "/ai/")).toEqual({
						response: expect.stringContaining("Workers AI"),
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

describe.skipIf(isWindows)("failure to connect to remote bindings", () => {
	const projectPath = seed("remote-bindings-incorrect-r2-config", {
		pm: "pnpm",
	});

	describe.each(commands)('with "%s" command', (command) => {
		test("logs the binding error without stopping the server", async ({
			expect,
		}) => {
			const bucketError = "R2 bucket 'non-existent-r2-bucket' not found";
			const apiUrl = await startMockCloudflareApi((request, response) => {
				const route = request.url ?? "";
				request.resume();
				response.setHeader("Content-Type", "application/json");
				if (route.endsWith("/subdomain/edge-preview")) {
					response.end(
						JSON.stringify({
							success: true,
							result: { token: "session-token" },
						})
					);
				} else if (route.endsWith("/workers/subdomain")) {
					response.end(
						JSON.stringify({ success: true, result: { subdomain: "mock" } })
					);
				} else if (
					request.method === "POST" &&
					route.endsWith("/edge-preview")
				) {
					response.writeHead(400).end(
						JSON.stringify({
							success: false,
							errors: [{ code: 10085, message: bucketError }],
						})
					);
				} else {
					response.writeHead(404).end(
						JSON.stringify({
							success: false,
							errors: [{ message: "Not found" }],
						})
					);
				}
			});

			const proc = await runLongLived("pnpm", command, projectPath, {
				CLOUDFLARE_ACCOUNT_ID: "mock-account",
				CLOUDFLARE_API_TOKEN: "mock-token",
				CLOUDFLARE_API_BASE_URL: apiUrl,
			});
			const url = await waitForReady(proc);
			const response = await fetch(new URL("/remote", url), {
				signal: AbortSignal.timeout(30_000),
			});
			expect(response.ok).toBe(false);
			await response.text();
			await vi.waitFor(() => expect(proc.stderr).toContain(bucketError), {
				timeout: 10_000,
			});
			expect(await (await fetch(url)).text()).toBe("Hello");
		});
	});
});

describe.skipIf(isWindows)(
	"remote bindings resolve auth profile from vite config root",
	() => {
		const projectPath = seed("remote-bindings-config-account-id", {
			pm: "pnpm",
		});

		test("uses the configured account and directory-bound auth on the first binding call", async ({
			expect,
		}) => {
			// Set up a fake HOME with a cf global config directory containing:
			//  - a named profile with a dummy oauth token
			//  - a directory binding mapping the project path to that profile
			const fakeHome = path.join(projectPath, ".fake-home");
			const xdgConfigHome = path.join(fakeHome, ".config");
			const cfDir = path.join(xdgConfigHome, "cloudflare");
			const fakeToken = "fake-oauth-token-for-e2e-test";

			mkdirSync(path.join(cfDir, "config"), { recursive: true });
			writeFileSync(
				path.join(cfDir, "config", "e2e-test-profile.json"),
				JSON.stringify({
					oauth_token: fakeToken,
					refresh_token: "fake-refresh-token",
					expiration_time: "2099-01-01T00:00:00+00:00",
				})
			);

			mkdirSync(path.join(cfDir, "profiles"), { recursive: true });
			writeFileSync(
				path.join(cfDir, "profiles", "directory-bindings.json"),
				JSON.stringify({ [projectPath]: "e2e-test-profile" })
			);

			const apiRequests: { url?: string; authorization?: string }[] = [];
			const apiUrl = await startMockCloudflareApi((request, response) => {
				apiRequests.push({
					url: request.url,
					authorization: request.headers.authorization,
				});
				response.writeHead(404, { "Content-Type": "application/json" });
				response.end(
					JSON.stringify({ success: false, errors: [{ message: "Not found" }] })
				);
			});
			const proc = await runLongLived("pnpm", "dev", projectPath, {
				HOME: fakeHome,
				XDG_CONFIG_HOME: xdgConfigHome,
				CLOUDFLARE_API_BASE_URL: apiUrl,
				CLOUDFLARE_API_TOKEN: undefined,
				CLOUDFLARE_API_KEY: undefined,
				CLOUDFLARE_EMAIL: undefined,
				CLOUDFLARE_AUTH_PROFILE: undefined,
			});
			const url = await waitForReady(proc);
			expect(await (await fetch(url)).text()).toBe("Hello world");
			expect(apiRequests).toHaveLength(0);

			const response = await fetch(new URL("/remote", url), {
				signal: AbortSignal.timeout(30_000),
			});
			expect(response.status).toBe(503);
			await response.text();
			expect(apiRequests[0]).toEqual({
				url: expect.stringMatching(
					/^\/client\/v4\/accounts\/not-a-valid-account-id-abc\/workers\/scripts\/[^/]+\/subdomain\/edge-preview$/
				),
				authorization: `Bearer ${fakeToken}`,
			});
		});
	}
);

describe.skipIf(isWindows)("remote bindings disabled", () => {
	const projectPath = seed("remote-bindings-disabled", { pm: "pnpm" });

	describe.each(commands)('with "%s" command', (command) => {
		test("cannot connect to remote bindings", async ({ expect }) => {
			const proc = await runLongLived("pnpm", command, projectPath);
			const url = await waitForReady(proc);

			const response = await fetch(url);

			const responseText = await response.text();

			expect(responseText).toContain("Error");
			expect(responseText).toContain("Binding AI needs to be run remotely");
		});
	});
});
