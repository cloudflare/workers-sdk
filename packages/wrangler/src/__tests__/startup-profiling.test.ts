import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, test } from "vitest";
import { summarizeStartupProfile } from "../check/commands";
import { logger } from "../logger";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";

describe("wrangler check startup", () => {
	mockConsoleMethods();
	const std = collectCLIOutput();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(false);
	});
	afterEach(() => {
		logger.resetLoggerLevel();
	});

	test("generates profile for basic worker", async ({ expect }) => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await runWrangler("check startup");

		expect(std.out).toContain(
			`CPU Profile has been written to worker-startup.cpuprofile`
		);
		expect(std.out).toMatch(/Bundle: \d+\.\d{2} KiB \/ gzip: \d+\.\d{2} KiB/);
		expect(std.out).toContain("Local startup profile:");
		expect(std.out).toContain("Profile window:");
		expect(std.out).toContain("Sampled time:");
		expect(std.out).toContain("Active:");
		expect(std.out).toContain("Idle:");
		expect(std.out).toContain("Samples:");

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});
	test("generates profile for basic worker w/ sourcemaps", async ({
		expect,
	}) => {
		writeWranglerConfig({ main: "index.js", upload_source_maps: true });
		writeWorkerSource();

		await runWrangler("check startup");

		expect(std.out).toContain(
			`CPU Profile has been written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});
	test("--outfile works", async ({ expect }) => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await runWrangler("check startup --outfile worker.cpuprofile");

		expect(std.out).toContain(
			`CPU Profile has been written to worker.cpuprofile`
		);
	});
	test("--args passed through to deploy", async ({ expect }) => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await expect(
			runWrangler("check startup --args 'abc'")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The entry-point file at "abc" was not found.

			This might mean that your entry-point file needs to be generated (which is the general case when a framework is being used).
			If that's the case please run your project's build command and try again.]
		`
		);
	});

	test("--worker-bundle is used instead of building", async ({ expect }) => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await runWrangler("deploy --dry-run --outfile worker.bundle");

		await expect(readFile("worker.bundle", "utf8")).resolves.toContain(
			"main_module"
		);
		await runWrangler("check startup --worker-bundle worker.bundle");
		expect(std.out).not.toContain(`Building your Worker`);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});

	test("pages (config file)", async ({ expect }) => {
		mkdirSync("public");
		writeFileSync("public/README.md", "This is a readme");

		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
				const a = true;
				a();

				export async function onRequest() {
					return new Response("Hello, world!");
				}
				`
		);
		writeWranglerConfig({ pages_build_output_dir: "public" });

		await runWrangler("check startup");

		expect(std.out).toContain(`Pages project detected`);

		expect(std.out).toContain(
			`CPU Profile has been written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});

	test("pages (args)", async ({ expect }) => {
		mkdirSync("public");
		writeFileSync("public/README.md", "This is a readme");

		mkdirSync("functions");
		writeFileSync(
			"functions/hello.js",
			`
				const a = true;
				a();

				export async function onRequest() {
					return new Response("Hello, world!");
				}
				`
		);

		await runWrangler(
			'check startup --args="--build-output-directory=public" --pages'
		);

		expect(std.out).toContain(`Pages project detected`);

		expect(std.out).toContain(
			`CPU Profile has been written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});
});

describe("summarizeStartupProfile", () => {
	test("separates active, garbage collection, and idle samples", ({
		expect,
	}) => {
		expect(
			summarizeStartupProfile({
				nodes: [
					{
						id: 1,
						callFrame: {
							functionName: "(idle)",
							scriptId: "0",
							url: "",
							lineNumber: -1,
							columnNumber: -1,
						},
					},
					{
						id: 2,
						callFrame: {
							functionName: "(garbage collector)",
							scriptId: "0",
							url: "",
							lineNumber: -1,
							columnNumber: -1,
						},
					},
					{
						id: 3,
						callFrame: {
							functionName: "startup",
							scriptId: "1",
							url: "index.js",
							lineNumber: 0,
							columnNumber: 0,
						},
					},
				],
				startTime: 1_000,
				endTime: 8_000,
				samples: [1, 2, 3],
				timeDeltas: [1_000, 2_000, 3_000],
			})
		).toEqual({
			profileWindow: 7_000,
			sampledTime: 6_000,
			activeTime: 5_000,
			garbageCollectionTime: 2_000,
			idleTime: 1_000,
			sampleCount: 3,
		});
	});
});
