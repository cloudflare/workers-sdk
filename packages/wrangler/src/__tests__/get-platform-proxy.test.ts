import { mkdirSync } from "node:fs";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { beforeEach, describe, it, vi } from "vitest";

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
});
