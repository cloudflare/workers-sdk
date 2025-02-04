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
	test("--deploy-args passed through to deploy", async () => {
		writeWranglerConfig({ main: "index.js" });
		writeWorkerSource();

		await expect(
			runWrangler("check startup --deploy-args 'abc'")
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
});
