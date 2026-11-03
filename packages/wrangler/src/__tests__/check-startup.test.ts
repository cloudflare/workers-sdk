import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { FormData, Response } from "undici";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

/**
 * Serializes an upload to disk the way `wrangler deploy --dry-run --outfile`
 * does, so `check startup --worker-bundle` can read it back.
 */
async function writeWorkerBundle(path: string, workerBundle: FormData) {
	const serialized = Buffer.from(await new Response(workerBundle).arrayBuffer());
	await writeFile(path, serialized);
}

/**
 * An upload whose entry module imports `./sibling.mjs`, with no `sibling.mjs`
 * part included, so module evaluation fails.
 */
function createWorkerBundleWithMissingModule(): FormData {
	const workerBundle = new FormData();
	workerBundle.set(
		"metadata",
		JSON.stringify({
			main_module: "index.mjs",
			compatibility_date: "2025-01-01",
			bindings: [],
		})
	);
	workerBundle.set(
		"index.mjs",
		new File(
			[
				'import { value } from "./sibling.mjs";\nexport default { fetch() { return new Response("ok"); } };\n',
			],
			"index.mjs",
			{ type: "application/javascript+module" }
		)
	);
	return workerBundle;
}

describe("check startup", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("fails when the uploaded module graph is incomplete", async ({
		expect,
	}) => {
		await writeWorkerBundle(
			"upload.bundle",
			createWorkerBundleWithMissingModule()
		);

		await expect(
			runWrangler(
				"check startup --worker-bundle upload.bundle --outfile broken.cpuprofile"
			)
		).rejects.toThrow(/module evaluation/i);
	});

	it("writes a profile for an upload whose modules evaluate", async ({
		expect,
	}) => {
		const workerBundle = createWorkerBundleWithMissingModule();
		workerBundle.set(
			"sibling.mjs",
			new File(["export const value = 1;\n"], "sibling.mjs", {
				type: "application/javascript+module",
			})
		);
		await writeWorkerBundle("upload.bundle", workerBundle);

		await runWrangler(
			"check startup --worker-bundle upload.bundle --outfile worker.cpuprofile"
		);

		expect(existsSync("worker.cpuprofile")).toBe(true);
	});
});
