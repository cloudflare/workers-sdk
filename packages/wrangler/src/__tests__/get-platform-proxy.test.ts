import { mkdirSync } from "node:fs";
import path from "node:path";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { beforeEach, describe, it, vi } from "vitest";
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
