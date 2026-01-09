import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { wranglerEntryPath } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev' with WRANGLER_BUILD_CONDITIONS", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "c3-wrangler-init--from-dash-"));
	});

	it("should import from the `other` package export if that is in the conditions", async () => {
		execFileSync(
			"node",
			[wranglerEntryPath, "deploy", "--dry-run", `--outdir=${tempDir}`],
			{
				env: {
					...process.env,
					WRANGLER_BUILD_CONDITIONS: "other,node,browser",
				},
				cwd: basePath,
			}
		);
		expect(readFileSync(resolve(tempDir, "index.js"), "utf8")).toContain(
			"isomorphic-random-example/src/other.js"
		);
	});

	it("should import from the `default` package export if the conditions are explicitly empty", async () => {
		execFileSync(
			"node",
			[wranglerEntryPath, "deploy", "--dry-run", `--outdir=${tempDir}`],
			{
				env: {
					...process.env,
					WRANGLER_BUILD_CONDITIONS: "",
				},
				cwd: basePath,
			}
		);
		expect(readFileSync(resolve(tempDir, "index.js"), "utf8")).toContain(
			"isomorphic-random-example/src/default.js"
		);
	});
});

describe("'wrangler build' with WRANGLER_BUILD_PLATFORM", () => {
	it("should import from node imports if platform is set to 'node'", () => {
		execFileSync(
			"node",
			[wranglerEntryPath, "deploy", "--dry-run", "--outdir=dist/node"],
			{
				env: {
					...process.env,
					WRANGLER_BUILD_PLATFORM: "node",
				},
				cwd: basePath,
			}
		);
		expect(
			readFileSync(resolve(__dirname, "../dist/node/index.js"), "utf8")
		).toContain("isomorphic-random-example/src/node.js");
	});

	it("should import from node imports if platform is set to 'browser'", ({
		expect,
	}) => {
		execFileSync(
			"node",
			[wranglerEntryPath, "deploy", "--dry-run", "--outdir=dist/browser"],
			{
				env: {
					...process.env,
					WRANGLER_BUILD_PLATFORM: "browser",
				},
				cwd: basePath,
			}
		);
		expect(
			readFileSync(resolve(__dirname, "../dist/browser/index.js"), "utf8")
		).toContain("../isomorphic-random-example/src/workerd.mjs");
	});
});
