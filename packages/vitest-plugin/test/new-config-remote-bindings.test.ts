import fs from "node:fs/promises";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import type { RemoteProxyConnectionString } from "miniflare";
import type { TestProject } from "vitest/node";

const remoteProxyConnectionString = new URL(
	"http://localhost:8787"
) as RemoteProxyConnectionString;

const {
	maybeStartOrUpdateRemoteProxySession,
	requireAuth,
	resolveProfile,
	state,
} = vi.hoisted(() => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
	requireAuth: vi.fn(async () => "cf-account-id"),
	resolveProfile: vi.fn(() => ({ name: "cf-profile" })),
	state: { wranglerImported: false },
}));

vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession,
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: () => ({
		setProfile: vi.fn(),
		requireAuth,
		requireApiToken: () => ({ apiToken: "cf-token" }),
	}),
	createCfProfileStore: () => ({ resolve: resolveProfile }),
}));

// Records whether Wrangler was imported, and stands in for it. Registered
// with `vi.doMock()` after `vi.resetModules()` in each test, so it runs again on
// that test's first import (a hoisted `vi.mock()` factory would only run once).
function wranglerFactory() {
	state.wranglerImported = true;
	return {
		unstable_readConfig: () => ({
			name: "test-worker",
			topLevelName: "test-worker",
		}),
		unstable_convertConfigBindingsToStartWorkerBindings: () => ({
			KV: { type: "kv_namespace", id: "kv-id", remote: true },
		}),
		unstable_getMiniflareWorkerOptions: () => ({
			workerOptions: {},
			externalWorkers: [],
			define: {},
			main: undefined,
		}),
	};
}

describe("remote bindings", () => {
	runInTempDir();

	let project: TestProject;

	beforeEach(() => {
		vi.resetModules();
		vi.doMock("wrangler", wranglerFactory);
		state.wranglerImported = false;
		project = {
			config: { root: process.cwd() },
			vite: { config: { mode: "test", envDir: process.cwd() } },
		} as unknown as TestProject;
		maybeStartOrUpdateRemoteProxySession.mockReset();
		requireAuth.mockClear();
		// Like the real function, return the hook the session was started with
		maybeStartOrUpdateRemoteProxySession.mockImplementation(
			async (_details: unknown, _pre: unknown, auth: unknown) => ({
				session: { remoteProxyConnectionString },
				remoteBindings: {},
				auth,
			})
		);
	});

	it("uses cf credentials for cloudflare.config.ts, without Wrangler", async ({
		expect,
	}) => {
		await fs.writeFile(
			"cloudflare.config.ts",
			`export default {
				accountId: "account-id",
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					env: {
						KV: { type: "kv", id: "kv-id", dev: { remote: true } },
					},
				},
			};`
		);
		const { parseProjectOptions } = await import("../src/pool/config");

		const options = await parseProjectOptions(project, {
			config: true,
		});
		await parseProjectOptions(project, { config: true });

		const [[details, , auth, context], [, , secondAuth]] =
			maybeStartOrUpdateRemoteProxySession.mock.calls;
		expect(details).toMatchObject({
			name: "test-worker",
			bindings: {
				KV: { type: "kv_namespace", id: "kv-id", remote: true },
			},
		});
		expect(context).toMatchObject({ cliDisplayName: "cf" });
		// The same hook, so the session isn't restarted on every re-parse
		expect(secondAuth).toBe(auth);
		await expect(auth()).resolves.toEqual({
			accountId: "cf-account-id",
			apiToken: { apiToken: "cf-token" },
		});
		expect(requireAuth).toHaveBeenCalledWith({ account_id: "account-id" });
		expect(resolveProfile).toHaveBeenCalledWith({ cwd: process.cwd() });
		expect(options.remoteProxyConnectionString).toBe(
			remoteProxyConnectionString
		);
		expect(state.wranglerImported).toBe(false);
	});

	it("creates a new hook when the account changes", async ({ expect }) => {
		// A config function, so the account follows the mode between parses
		await fs.writeFile(
			"cloudflare.config.ts",
			`export default ({ mode }) => ({
				accountId: mode + "-account",
				worker: {
					name: "test-worker",
					compatibilityDate: "2025-12-02",
					env: {
						KV: { type: "kv", id: "kv-id", dev: { remote: true } },
					},
				},
			});`
		);
		const { parseProjectOptions } = await import("../src/pool/config");

		await parseProjectOptions(project, { config: true });
		const stagingProject = {
			config: project.config,
			vite: { config: { mode: "staging", envDir: process.cwd() } },
		} as unknown as TestProject;
		await parseProjectOptions(stagingProject, { config: true });

		const [[, , auth], [, , newAuth]] =
			maybeStartOrUpdateRemoteProxySession.mock.calls;
		// A new hook, so the session restarts with the new account
		expect(newAuth).not.toBe(auth);
		await newAuth();
		expect(requireAuth).toHaveBeenCalledWith({
			account_id: "staging-account",
		});
	});

	it("keeps Wrangler's credentials for Wrangler configs", async ({
		expect,
	}) => {
		const { parseProjectOptions } = await import("../src/pool/config");

		await parseProjectOptions(project, {
			wrangler: { configPath: "./wrangler.jsonc" },
		});

		const [[, , auth, context]] =
			maybeStartOrUpdateRemoteProxySession.mock.calls;
		expect(auth).toBeUndefined();
		expect(context).toMatchObject({ cliDisplayName: "Wrangler" });
		expect(state.wranglerImported).toBe(true);
	});
});
