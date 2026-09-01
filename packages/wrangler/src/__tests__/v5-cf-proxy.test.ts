import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";

const wranglerBin = path.resolve(import.meta.dirname, "../../bin/wrangler.js");

describe("Wrangler v5 cf proxy", () => {
	runInTempDir();

	test("runs npx cf with all Wrangler arguments unchanged", ({ expect }) => {
		const fakeBinDir = createFakeNpx();
		const result = spawnSync(
			process.execPath,
			[
				wranglerBin,
				"deploy",
				"--name",
				"worker with spaces",
				"--",
				"literal-value",
			],
			{
				encoding: "utf8",
				env: withFakeNpx(fakeBinDir),
			}
		);

		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual([
			"cf",
			"deploy",
			"--name",
			"worker with spaces",
			"--",
			"literal-value",
		]);
	});

	test("propagates the npx exit code", ({ expect }) => {
		const fakeBinDir = createFakeNpx(23);
		const result = spawnSync(process.execPath, [wranglerBin, "deploy"], {
			env: withFakeNpx(fakeBinDir),
		});

		expect(result.status).toBe(23);
	});
});

/**
 * Creates an `npx` executable that reports the arguments it receives.
 *
 * @param exitCode The exit code returned by the executable.
 * @returns The directory containing the fake executable.
 */
function createFakeNpx(exitCode = 0) {
	const fakeBinDir = path.resolve("fake-bin");
	const fakeNpxPath = path.join(fakeBinDir, "npx");
	mkdirSync(fakeBinDir, { recursive: true });
	writeFileSync(
		fakeNpxPath,
		`#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\nprocess.exit(${exitCode});\n`
	);
	chmodSync(fakeNpxPath, 0o755);
	return fakeBinDir;
}

/**
 * Prepends the fake executable directory to `PATH`.
 *
 * @param fakeBinDir The directory containing the fake `npx` executable.
 * @returns An environment configured to resolve the fake executable first.
 */
function withFakeNpx(fakeBinDir: string) {
	return {
		...process.env,
		PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
	};
}
