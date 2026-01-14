// /* eslint-disable no-shadow */
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validate } from "../../pages/validate";
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("../../pages/constants", async (importActual) => ({
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	...(await importActual<typeof import("../../pages/constants")>()),
	MAX_ASSET_SIZE: 1 * 1024 * 1024,
	MAX_ASSET_COUNT_DEFAULT: 10,
}));

describe("pages project validate", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
	});

	it("should exit cleanly for a good directory", async () => {
		writeFileSync("logo.png", "foobar");

		await runWrangler("pages project validate .");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should error for a large file", async () => {
		writeFileSync("logo.png", Buffer.alloc(1 * 1024 * 1024 + 1));

		await expect(() => runWrangler("pages project validate .")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Error: Pages only supports files up to 1 MiB in size
			logo.png is 1 MiB in size]
		`);
	});

	it("should error for a large directory", async () => {
		for (let i = 0; i < 10 + 1; i++) {
			writeFileSync(`logo${i}.png`, Buffer.alloc(1));
		}

		await expect(() =>
			runWrangler("pages project validate .")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: Error: Pages only supports up to 10 files in a deployment for your current plan. Ensure you have specified your build output directory correctly.]`
		);
	});

	it("should succeed with custom fileCountLimit even when exceeding default limit", async () => {
		// Create 11 files, which exceeds the mocked MAX_ASSET_COUNT_DEFAULT of 10
		for (let i = 0; i < 11; i++) {
			writeFileSync(`logo${i}.png`, Buffer.alloc(1));
		}

		// Should succeed when passing a custom fileCountLimit of 20
		const fileMap = await validate({ directory: ".", fileCountLimit: 20 });
		expect(fileMap.size).toBe(11);
	});

	it("should error with custom fileCountLimit when exceeding custom limit", async () => {
		// Create 6 files
		for (let i = 0; i < 6; i++) {
			writeFileSync(`logo${i}.png`, Buffer.alloc(1));
		}

		// Should fail when passing a custom fileCountLimit of 5
		await expect(() =>
			validate({ directory: ".", fileCountLimit: 5 })
		).rejects.toThrowError(
			"Error: Pages only supports up to 5 files in a deployment for your current plan. Ensure you have specified your build output directory correctly."
		);
	});
});
