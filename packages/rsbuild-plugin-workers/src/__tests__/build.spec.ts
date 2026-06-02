import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRsbuild } from "@rsbuild/core";
import { describe, test } from "vitest";
import { cloudflare } from "../index";

describe("cloudflare", () => {
	test("builds a worker environment and emits wrangler config", async ({
		expect,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "rsbuild-plugin-workers-"));
		await mkdir(join(root, "src"), { recursive: true });
		writeFileSync(
			join(root, "src/index.ts"),
			`export default { fetch() { return new Response("ok"); } };`
		);
		writeFileSync(
			join(root, "wrangler.json"),
			JSON.stringify({
				name: "test-worker",
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
			})
		);

		const rsbuild = await createRsbuild({
			cwd: root,
			config: {
				plugins: [
					cloudflare({
						configPath: "wrangler.json",
						persistState: false,
						inspectorPort: false,
					}),
				],
			},
		});

		await rsbuild.build();

		const workerOutDir = join(root, "dist/test_worker");
		expect(existsSync(join(workerOutDir, "index.js"))).toBe(true);
		expect(readFileSync(join(workerOutDir, "index.js"), "utf8")).toContain(
			"export"
		);
		expect(existsSync(join(workerOutDir, "wrangler.json"))).toBe(true);
		expect(
			JSON.parse(readFileSync(join(workerOutDir, "wrangler.json"), "utf8"))
		).toMatchObject({
			name: "test-worker",
			main: "index.js",
			no_bundle: true,
		});
		expect(existsSync(join(root, ".wrangler/deploy/config.json"))).toBe(true);
	});
});
