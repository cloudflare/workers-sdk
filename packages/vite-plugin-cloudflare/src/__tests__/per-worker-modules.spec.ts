import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { getWorkerBundleDir } from "@cloudflare/build-output-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { test } from "vitest";

runInTempDir();

/**
 * Builds `worker-a` (from `cloudflare.config.ts`) and the auxiliary `worker-b`
 * with per-Worker modules enabled.
 *
 * @param workerBSource The source of `worker-b.ts`.
 */
async function build(workerBSource: string): Promise<void> {
	await fs.writeFile(
		"cloudflare.config.ts",
		`export default { worker: {
			name: "worker-a",
			entrypoint: "./worker-a.ts",
			compatibilityDate: "2024-12-30",
		} };`
	);
	await fs.writeFile(
		"worker-a.ts",
		`import { env } from "cloudflare:workers/worker-a";
		export default { fetch() { return new Response(String(env)); } };`
	);
	await fs.writeFile("worker-b.ts", workerBSource);

	const script = `
		import { createBuilder } from "vite";
		const { cloudflare } = await import("@cloudflare/vite-plugin");
		const builder = await createBuilder({
			root: process.argv[1],
			configFile: false,
			logLevel: "silent",
			plugins: [cloudflare({
				types: { generate: false },
				experimental: { perWorkerModules: true },
				auxiliaryWorkers: [{ config: {
					name: "worker-b",
					entrypoint: "./worker-b.ts",
					compatibilityDate: "2024-12-30",
				} }],
			})],
		}, null);
		await builder.buildApp();
	`;
	await promisify(execFile)(
		process.execPath,
		["--input-type=module", "--eval", script, process.cwd()],
		{ cwd: path.resolve(import.meta.dirname, "../.."), timeout: 30_000 }
	);
}

/**
 * Reads every file a Worker's bundle contains.
 *
 * @param directoryName The Worker's Build Output directory name.
 * @returns The concatenated file contents.
 */
async function readBundle(directoryName?: string): Promise<string> {
	const bundleDir = getWorkerBundleDir(process.cwd(), directoryName);
	const files = await fs.readdir(bundleDir, { recursive: true });
	const contents = await Promise.all(
		files
			.filter((file) => /\.m?js$/.test(file))
			.map((file) => fs.readFile(path.join(bundleDir, file), "utf8"))
	);
	return contents.join("\n");
}

test("resolves each Worker's own module to `cloudflare:workers`", async ({
	expect,
}) => {
	await build(
		`import { WorkerEntrypoint } from "cloudflare:workers/worker-b";
		export default class extends WorkerEntrypoint {}`
	);

	for (const bundle of [await readBundle(), await readBundle("worker-b")]) {
		expect(bundle).toContain('from "cloudflare:workers"');
		expect(bundle).not.toContain("cloudflare:workers/");
	}
});

test("fails the build when a Worker imports another Worker's module", async ({
	expect,
}) => {
	await expect(
		build(
			`import { env } from "cloudflare:workers/worker-a";
			export default { fetch() { return new Response(String(env)); } };`
		)
	).rejects.toThrow(
		'Cannot import "cloudflare:workers/worker-a" in the "worker-b" Worker'
	);
});
