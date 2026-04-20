import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "vitest";
import { fetchJson, runLongLived, seed, waitForReady } from "./helpers.js";

describe("generated Wrangler config path", () => {
	const projectPath = seed("dynamic", { pm: "pnpm" });

	test("can serve a Vite app using CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH", async ({
		expect,
	}) => {
		await mkdir(path.join(projectPath, ".generated"), { recursive: true });
		await writeFile(
			path.join(projectPath, ".generated/wrangler.jsonc"),
			JSON.stringify(
				{
					name: "cloudflare-vite-e2e-generated-config-path",
					main: "../src/index.ts",
					compatibility_date: "2024-12-30",
					compatibility_flags: ["nodejs_compat"],
				},
				null,
				2
			)
		);
		await rm(path.join(projectPath, "wrangler.jsonc"));

		const proc = await runLongLived("pnpm", "dev", projectPath, {
			CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: ".generated/wrangler.jsonc",
		});
		const url = await waitForReady(proc);

		expect(await fetchJson(url)).toEqual("OK!");
	});
});
