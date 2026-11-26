import { mkdirSync } from "node:fs";
import path from "node:path";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { beforeEach, describe, it, vi } from "vitest";
import * as remoteBindingsAuth from "../api/remoteBindings/auth";
import { mockConsoleMethods } from "./helpers/mock-console";

const { miniflareInstances } = vi.hoisted(() => ({
	miniflareInstances: [] as Array<{ ready: Promise<URL> }>,
}));

vi.mock("miniflare", async (importOriginal) => {
	const actual = await importOriginal<typeof import("miniflare")>();

	class TestMiniflare extends actual.Miniflare {
		constructor(...args: ConstructorParameters<typeof actual.Miniflare>) {
			super(...args);
			miniflareInstances.push(this);
		}
	}

	return { ...actual, Miniflare: TestMiniflare };
});

import { getPlatformProxy } from "../api";

describe("getPlatformProxy", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		miniflareInstances.length = 0;
	});

	it("authenticates a remote-only K2 binding before returning the platform proxy", async ({
		expect,
		onTestFinished,
	}) => {
		writeWranglerConfig(
			{
				name: "test-worker",
				account_id: "abcdef0123456789abcdef0123456789",
				compatibility_date: "2026-11-02",
				k2: [
					{
						binding: "ORDERS",
						stream: "0123456789abcdef0123456789abcdef",
						remote: true,
					},
				],
			},
			"./wrangler.json"
		);
		const hook = vi.fn().mockRejectedValue(new Error("Login cancelled"));
		const auth = vi
			.spyOn(remoteBindingsAuth, "getDefaultRemoteBindingsAuth")
			.mockReturnValue({ hook });
		onTestFinished(() => auth.mockRestore());

		const startup = getPlatformProxy({ persist: false }).then(async (proxy) => {
			await proxy.dispose();
		});
		await expect(startup).rejects.toThrow("Login cancelled");
		expect(auth).toHaveBeenCalledExactlyOnceWith(
			"abcdef0123456789abcdef0123456789"
		);
		expect(hook).toHaveBeenCalledOnce();
	});

	it.for([
		{ remote: false, remoteBindings: true },
		{ remote: true, remoteBindings: false },
	])(
		"does not authenticate when KV is local or remote bindings are disabled (%j)",
		async ({ remote, remoteBindings }, { expect, onTestFinished }) => {
			writeWranglerConfig(
				{
					name: "test-worker",
					compatibility_date: "2026-11-02",
					kv_namespaces: [
						{ binding: "KV", id: "0123456789abcdef0123456789abcdef", remote },
					],
				},
				"./wrangler.json"
			);
			const hook = vi.fn().mockRejectedValue(new Error("Unexpected login"));
			const auth = vi
				.spyOn(remoteBindingsAuth, "getDefaultRemoteBindingsAuth")
				.mockReturnValue({ hook });
			onTestFinished(() => auth.mockRestore());

			const proxy = await getPlatformProxy({ persist: false, remoteBindings });
			onTestFinished(() => proxy.dispose());
			expect(auth).not.toHaveBeenCalled();
		}
	);

	it("returns 404 for asset misses", async ({ expect }) => {
		mkdirSync("public");
		writeWranglerConfig(
			{
				name: "test-worker",
				main: "./index.js",
				compatibility_date: "2026-11-02",
				assets: {
					binding: "ASSETS",
					directory: "./public",
				},
			},
			"./wrangler.json"
		);

		const platform = await getPlatformProxy({
			configPath: "./wrangler.json",
			persist: false,
			remoteBindings: false,
		});

		try {
			const url = await miniflareInstances[0].ready;
			const response = await fetch(new URL("/missing", url), {
				signal: AbortSignal.timeout(1_000),
			});

			expect(response.status).toBe(404);
		} finally {
			await platform.dispose();
		}
	});

	it("warns once about an omitted Artifacts remote when remote bindings are enabled", async ({
		expect,
	}) => {
		writeWranglerConfig(
			{
				name: "test-worker",
				compatibility_date: "2026-11-02",
				artifacts: [{ binding: "REPOS", namespace: "examples" }],
			},
			"./wrangler.json"
		);
		const warning =
			"Artifacts binding REPOS uses the local simulator by default. Set `remote: true` to use deployed repos, or `remote: false` to silence this warning.";
		const start = async (remoteBindings: boolean) =>
			(
				await getPlatformProxy({
					configPath: "./wrangler.json",
					persist: false,
					remoteBindings,
				})
			).dispose();

		// With remote bindings disabled, Artifacts always used the simulator.
		await start(false);
		expect(std.warn).not.toContain(warning);

		await start(true);
		await start(true);
		expect(std.warn.split(warning)).toHaveLength(2);
	});

	it("warns for each project that uses the same relative config path", async ({
		expect,
	}) => {
		const root = process.cwd();
		const warning =
			"Artifacts binding OTHER_REPOS uses the local simulator by default. Set `remote: true` to use deployed repos, or `remote: false` to silence this warning.";
		try {
			for (const project of ["a", "b"]) {
				mkdirSync(path.join(root, project));
				process.chdir(path.join(root, project));
				writeWranglerConfig(
					{
						name: `worker-${project}`,
						compatibility_date: "2026-11-02",
						artifacts: [{ binding: "OTHER_REPOS", namespace: "examples" }],
					},
					"./wrangler.json"
				);
				await (
					await getPlatformProxy({
						configPath: "./wrangler.json",
						persist: false,
					})
				).dispose();
			}
		} finally {
			process.chdir(root);
		}
		expect(std.warn.split(warning)).toHaveLength(3);
	});
});
