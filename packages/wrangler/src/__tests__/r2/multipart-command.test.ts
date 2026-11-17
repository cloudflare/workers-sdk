import { mkdirSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import * as dialogs from "../../dialogs";
import { createRemoteMultipartTransport } from "../../r2/helpers/multipart-transport";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { MultipartTransport } from "../../r2/helpers/multipart";

vi.mock("../../r2/helpers/multipart-transport", () => ({
	createRemoteMultipartTransport: vi.fn(),
}));

describe("r2 object put --multipart", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const factory = vi.mocked(createRemoteMultipartTransport);
	beforeEach(() => {
		factory.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.for([
		"--multipart --file source",
		"--multipart --remote --pipe",
		"--multipart --local --file source",
		"--multipart --remote --no-remote --file source",
	])("rejects incompatible arguments: %s", async (flags, { expect }) => {
		writeFileSync("source", "source");
		await expect(
			runWrangler(`r2 object put bucket/key ${flags}`)
		).rejects.toThrow();
		expect(factory).not.toHaveBeenCalled();
	});

	it.for(["missing", "directory", "empty"])(
		"rejects %s files without connecting",
		async (kind, { expect }) => {
			if (kind === "directory") {
				mkdirSync("source");
			}
			if (kind === "empty") {
				writeFileSync("source", "");
			}
			await expect(
				runWrangler(
					"r2 object put bucket/key --multipart --remote --file source --force"
				)
			).rejects.toThrow();
			expect(factory).not.toHaveBeenCalled();
		}
	);

	it("documents the flag and required permissions in help", async ({
		expect,
	}) => {
		await runWrangler("r2 object put --help");
		expect(std.out).toContain("--multipart");
		expect(std.out).toContain("Workers preview permissions");
	});

	it("requires acknowledgement before connecting", async ({ expect }) => {
		writeFileSync("source", "source");
		vi.spyOn(dialogs, "confirm").mockResolvedValue(false);
		await expect(
			runWrangler("r2 object put bucket/key --multipart --remote --file source")
		).rejects.toThrow("Use --force");
		expect(factory).not.toHaveBeenCalled();
	});

	it("preserves the bucket, key, jurisdiction and metadata, and reports verified success", async ({
		expect,
	}) => {
		writeFileSync("source", "source");
		const confirm = vi.spyOn(dialogs, "confirm");
		const transport: MultipartTransport = {
			create: vi.fn(async () => "upload"),
			uploadPart: vi.fn(async (_id, partNumber, body) => {
				for await (const _chunk of body) {
					/* Drain the upload. */
				}
				return { partNumber, etag: "part-etag" };
			}),
			complete: vi.fn(async () => ({ size: 6, etag: "etag" })),
			get: vi.fn(async () => ({
				body: Readable.from([Buffer.from("source")]),
				size: 6,
				etag: "etag",
			})),
			abort: vi.fn(async () => {}),
			dispose: vi.fn(async () => {}),
		};
		factory.mockResolvedValue(transport);
		const signals = [
			process.listenerCount("SIGINT"),
			process.listenerCount("SIGTERM"),
		];
		await runWrangler(
			'r2 object put bucket/folder/key --multipart --remote --file source --force -J eu -s InfrequentAccess --ct text/plain --cc private --ce gzip --cl en --cd attachment --expires "Tue, 01 Jan 2030 00:00:00 GMT"'
		);
		expect(factory).toHaveBeenCalledWith(
			expect.anything(),
			"bucket",
			"folder/key",
			{
				httpMetadata: {
					contentType: "text/plain",
					cacheControl: "private",
					contentEncoding: "gzip",
					contentLanguage: "en",
					contentDisposition: "attachment",
					cacheExpiry: new Date("2030-01-01"),
				},
				storageClass: "InfrequentAccess",
			},
			"eu"
		);
		expect(confirm).not.toHaveBeenCalled();
		expect(std.out).toContain("Upload complete. Verified 6 bytes, SHA-256:");
		expect(transport.dispose).toHaveBeenCalledOnce();
		expect([
			process.listenerCount("SIGINT"),
			process.listenerCount("SIGTERM"),
		]).toEqual(signals);
	});

	it("does not report success or leak signal handlers if the connection fails", async ({
		expect,
	}) => {
		writeFileSync("source", "source");
		factory.mockRejectedValue(new Error("connection failed"));
		const listeners = process.listenerCount("SIGINT");
		await expect(
			runWrangler(
				"r2 object put bucket/key --multipart --remote --file source --force"
			)
		).rejects.toThrow("connection failed");
		expect(std.out).not.toContain("Upload complete");
		expect(process.listenerCount("SIGINT")).toBe(listeners);
	});

	it("validates expiry before connecting", async ({ expect }) => {
		writeFileSync("source", "source");
		await expect(
			runWrangler(
				"r2 object put bucket/key --multipart --remote --file source --force --expires invalid"
			)
		).rejects.toThrow("valid HTTP date");
		expect(factory).not.toHaveBeenCalled();
	});
});
