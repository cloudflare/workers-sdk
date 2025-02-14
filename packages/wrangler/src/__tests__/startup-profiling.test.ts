import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { mockConsoleMethods } from "./helpers/mock-console";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWorkerSource } from "./helpers/write-worker-source";
import { writeWranglerConfig } from "./helpers/write-wrangler-config";

describe("wrangler check startup", () => {
	mockConsoleMethods();
	const std = collectCLIOutput();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	setIsTTY(false);

	test("generates profile for basic worker", async () => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await runWrangler("check startup");

		expect(std.out).toContain(
			`CPU Profile written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});
	test("--outfile works", async () => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await runWrangler("check startup --outfile worker.cpuprofile");

		expect(std.out).toContain(`CPU Profile written to worker.cpuprofile`);
	});
	test("--args passed through to deploy", async () => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await expect(
			runWrangler("check startup --args 'abc'")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The entry-point file at "abc" was not found.]`
		);
	});

	test("--worker-bundle is used instead of building", async () => {
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

	test("pages (config file)", async () => {
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
			`CPU Profile written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});

	test("pages (args)", async () => {
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
			`CPU Profile written to worker-startup.cpuprofile`
		);

		await expect(
			readFile("worker-startup.cpuprofile", "utf8")
		).resolves.toContain("callFrame");
	});
});
