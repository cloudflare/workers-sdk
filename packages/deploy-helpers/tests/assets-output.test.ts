import { mkdirSync, writeFileSync } from "node:fs";
import {
	mockConsoleMethods,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { syncAssets } from "../src/deploy/helpers/assets";

const mocks = vi.hoisted(() => ({ fetchResult: vi.fn() }));

vi.mock("../src/shared/context", () => ({
	fetchResult: mocks.fetchResult,
	logger: console,
}));

vi.mock("../src/deploy/helpers/hash", () => ({
	hashFile: () => "asset-hash",
}));

describe("asset upload output", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		mkdirSync("assets");
		writeFileSync("assets/index.html", "hello");
	});

	it("logs asset progress by default", async ({ expect }) => {
		mocks.fetchResult
			.mockResolvedValueOnce({
				buckets: [["asset-hash"]],
				jwt: "session-token",
			})
			.mockResolvedValueOnce({ jwt: "completion-token" });
		await syncAssets({}, "account-id", "assets", "worker");
		expect(std.info).toContain("Building list of assets");
		expect(std.info).toContain("Read 1 file");
		expect(std.info).toContain("Uploaded 1 of 1 asset");
		expect(std.out).toContain("Success! Uploaded 1 file");
	});

	it.for([[], ["asset-hash"]])(
		"does not print asset progress in quiet mode (bucket=%j)",
		async (bucket, { expect }) => {
			mocks.fetchResult
				.mockResolvedValueOnce({ buckets: [bucket], jwt: "session-token" })
				.mockResolvedValueOnce({ jwt: "completion-token" });
			const result = await syncAssets(
				{},
				"account-id",
				"assets",
				"worker",
				undefined,
				{ quiet: true }
			);
			expect(std.out).toBe("");
			expect(std.info).toBe("");
			expect(std.debug).toBe("");
			expect(result.jwt).toBe(
				bucket.length ? "completion-token" : "session-token"
			);
			expect(result.assetUploadStats.assetUploadFileCount).toBe(bucket.length);
		}
	);

	it("keeps normal uploads visible alongside a quiet upload", async ({
		expect,
	}) => {
		mocks.fetchResult.mockResolvedValue({ buckets: [], jwt: "session-token" });
		await Promise.all([
			syncAssets({}, "account-id", "assets", "quiet-worker", undefined, {
				quiet: true,
			}),
			syncAssets({}, "account-id", "assets", "normal-worker"),
		]);
		expect(std.info.match(/Building list of assets/g)).toHaveLength(1);
		expect(std.info.match(/Read 1 file/g)).toHaveLength(1);
		expect(std.info.match(/No updated asset files/g)).toHaveLength(1);
	});

	it("propagates upload failures in quiet mode", async ({ expect }) => {
		const error = new Error("Asset upload failed");
		mocks.fetchResult.mockRejectedValueOnce(error);
		await expect(
			syncAssets({}, "account-id", "assets", "worker", undefined, {
				quiet: true,
			})
		).rejects.toBe(error);
		expect(std.out).toBe("");
	});
});
