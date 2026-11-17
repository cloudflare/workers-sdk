import { createHash } from "node:crypto";
import {
	createReadStream,
	mkdirSync,
	statSync,
	truncateSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { describe, it, vi } from "vitest";
import multipartWorkerPath from "worker:r2-multipart";
import {
	MULTIPART_MAX_PARTS,
	MULTIPART_PART_SIZE,
	MultipartRequestError,
	uploadMultipartFile,
} from "../../r2/helpers/multipart";
import { createMultipartTransport } from "../../r2/helpers/multipart-transport";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { MultipartTransport } from "../../r2/helpers/multipart";

// Miniflare requires undici's real request and response implementations.
vi.unmock("undici");

describe("multipart uploader", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	function createTransport() {
		const size = statSync("source").size;
		return {
			create: vi.fn<MultipartTransport["create"]>(async () => "upload-id"),
			uploadPart: vi.fn<MultipartTransport["uploadPart"]>(
				async (_id, partNumber, body) => {
					for await (const _chunk of body) {
						/* Consume with backpressure, without buffering the file. */
					}
					return { partNumber, etag: `etag-${partNumber}` };
				}
			),
			complete: vi.fn<MultipartTransport["complete"]>(async () => ({
				size,
				etag: "completed-etag",
			})),
			get: vi.fn<MultipartTransport["get"]>(async () => ({
				body: createReadStream("source"),
				size,
				etag: "completed-etag",
			})),
			abort: vi.fn<MultipartTransport["abort"]>(async () => {}),
			dispose: vi.fn(async () => {}),
		} satisfies MultipartTransport;
	}

	it.for([1, MULTIPART_PART_SIZE, MULTIPART_PART_SIZE + 1])(
		"uploads %i bytes in ordered, bounded parts",
		async (size, { expect }) => {
			writeFileSync("source", "x");
			truncateSync("source", size);
			const transport = createTransport();
			const factory = vi.fn(async () => transport);
			const result = await uploadMultipartFile(
				"source",
				factory,
				new AbortController().signal
			);
			expect(result?.size).toBe(size);
			expect(result?.sha256).toMatch(/^[a-f0-9]{64}$/);
			const count = Math.ceil(size / MULTIPART_PART_SIZE);
			expect(transport.uploadPart).toHaveBeenCalledTimes(count);
			expect(
				transport.uploadPart.mock.calls.map((call) => [call[1], call[3]])
			).toEqual(
				size <= MULTIPART_PART_SIZE
					? [[1, size]]
					: [
							[1, MULTIPART_PART_SIZE],
							[2, 1],
						]
			);
			expect(transport.complete.mock.calls[0]).toEqual([
				"upload-id",
				Array.from({ length: count }, (_, i) => ({
					partNumber: i + 1,
					etag: `etag-${i + 1}`,
				})),
				expect.any(AbortSignal),
			]);
			expect(transport.abort).not.toHaveBeenCalled();
			expect(transport.dispose).toHaveBeenCalledOnce();
		}
	);

	it.for(["missing", "directory", "empty", "too large"])(
		"rejects %s input before creating a connection",
		async (kind, { expect }) => {
			if (kind === "directory") {
				mkdirSync("source");
			} else if (kind !== "missing") {
				writeFileSync("source", "");
				if (kind === "too large") {
					truncateSync("source", MULTIPART_PART_SIZE * MULTIPART_MAX_PARTS + 1);
				}
			}
			const factory = vi.fn();
			await expect(
				uploadMultipartFile("source", factory, new AbortController().signal)
			).rejects.toThrow();
			expect(factory).not.toHaveBeenCalled();
		}
	);

	it("retries the same part with a fresh stream from its beginning", async ({
		expect,
	}) => {
		writeFileSync("source", "retry me");
		const transport = createTransport();
		transport.uploadPart.mockImplementationOnce(async (_id, _number, body) => {
			for await (const _chunk of body) {
				break;
			}
			throw new MultipartRequestError("busy", 503);
		});
		let retried = "";
		transport.uploadPart.mockImplementationOnce(
			async (_id, partNumber, body) => {
				for await (const chunk of body) {
					retried += chunk.toString();
				}
				return { partNumber, etag: "etag-1" };
			}
		);
		await uploadMultipartFile(
			"source",
			async () => transport,
			new AbortController().signal
		);
		expect(retried).toBe("retry me");
		expect(transport.uploadPart.mock.calls.map((call) => call[1])).toEqual([
			1, 1,
		]);
		expect(transport.uploadPart.mock.calls[0]?.[2]).not.toBe(
			transport.uploadPart.mock.calls[1]?.[2]
		);
	});

	it.for([400, 403, 404, 429, 503])(
		"aborts after a permanent or exhausted %i failure",
		async (status, { expect }) => {
			writeFileSync("source", "source");
			const transport = createTransport();
			const error = new MultipartRequestError("failed", status);
			transport.uploadPart.mockRejectedValue(error);
			await expect(
				uploadMultipartFile(
					"source",
					async () => transport,
					new AbortController().signal
				)
			).rejects.toBe(error);
			expect(transport.uploadPart).toHaveBeenCalledTimes(
				status === 503 || status === 429 ? 4 : 1
			);
			expect(transport.complete).not.toHaveBeenCalled();
			expect(transport.abort).toHaveBeenCalledOnce();
			expect(transport.dispose).toHaveBeenCalledOnce();
		}
	);

	it("preserves the original failure when abort fails", async ({ expect }) => {
		writeFileSync("source", "source");
		const transport = createTransport();
		const error = new Error("upload failed");
		transport.uploadPart.mockRejectedValue(error);
		transport.abort.mockRejectedValue(new Error("abort failed"));
		await expect(
			uploadMultipartFile(
				"source",
				async () => transport,
				new AbortController().signal
			)
		).rejects.toBe(error);
		expect(std.warn).toContain("Could not confirm multipart cleanup");
		expect(transport.dispose).toHaveBeenCalledOnce();
	});

	it("aborts when the source changes before completion", async ({ expect }) => {
		writeFileSync("source", "source");
		const transport = createTransport();
		transport.uploadPart.mockImplementationOnce(
			async (_id, partNumber, body) => {
				for await (const _chunk of body) {
					/* Drain before modifying the file. */
				}
				writeFileSync("source", "changed source");
				return { partNumber, etag: "etag-1" };
			}
		);
		await expect(
			uploadMultipartFile(
				"source",
				async () => transport,
				new AbortController().signal
			)
		).rejects.toThrow("source file changed");
		expect(transport.complete).not.toHaveBeenCalled();
		expect(transport.abort).toHaveBeenCalledOnce();
	});

	it.for(["size", "hash", "etag", "read failure"])(
		"reports %s verification failures without deleting or aborting a completed object",
		async (kind, { expect }) => {
			writeFileSync("source", "source");
			const transport = createTransport();
			if (kind === "read failure") {
				transport.get.mockRejectedValue(new Error("read failed"));
			} else {
				transport.get.mockResolvedValue({
					body: Readable.from([
						Buffer.from(kind === "hash" ? "broken" : "source"),
					]),
					size: kind === "size" ? 100 : 6,
					etag: kind === "etag" ? "other" : "completed-etag",
				});
			}
			await expect(
				uploadMultipartFile(
					"source",
					async () => transport,
					new AbortController().signal
				)
			).rejects.toThrow();
			expect(transport.abort).not.toHaveBeenCalled();
			expect(std.warn).toContain("may already be published");
			expect(transport.dispose).toHaveBeenCalledOnce();
		}
	);

	it("does not retry a completion whose response was lost", async ({
		expect,
	}) => {
		writeFileSync("source", "source");
		const transport = createTransport();
		transport.complete.mockRejectedValue(
			new MultipartRequestError("response lost", 503)
		);
		await expect(
			uploadMultipartFile(
				"source",
				async () => transport,
				new AbortController().signal
			)
		).rejects.toThrow("response lost");
		expect(transport.complete).toHaveBeenCalledOnce();
		expect(transport.abort).toHaveBeenCalledOnce();
		expect(std.warn).toContain("may already be published");
	});

	it("uses an independent cleanup signal when interrupted", async ({
		expect,
	}) => {
		writeFileSync("source", "source");
		const controller = new AbortController();
		const transport = createTransport();
		transport.uploadPart.mockImplementationOnce(async () => {
			controller.abort(new Error("interrupted"));
			controller.signal.throwIfAborted();
			throw new Error("unreachable");
		});
		await expect(
			uploadMultipartFile("source", async () => transport, controller.signal)
		).rejects.toThrow("interrupted");
		expect(transport.abort.mock.calls[0]?.[1].aborted).toBe(false);
		expect(transport.dispose).toHaveBeenCalledOnce();
	});
});

describe("multipart HTTP adapter", () => {
	runInTempDir();
	mockConsoleMethods();

	it("streams multipart bodies through a real R2 binding, preserves metadata, and verifies readback", async ({
		expect,
	}) => {
		writeFileSync("source", "source");
		truncateSync("source", MULTIPART_PART_SIZE + 7);
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				scriptPath: multipartWorkerPath,
				modulesRoot: dirname(multipartWorkerPath),
				compatibilityDate: "2025-04-28",
				r2Buckets: { BUCKET: "bucket" },
			})
		);
		const options = {
			httpMetadata: {
				contentType: "application/octet-stream",
				cacheControl: "private",
				cacheExpiry: new Date("2030-01-01"),
			},
			storageClass: "InfrequentAccess",
		};
		const transport = createMultipartTransport(
			mf,
			"folder/a ?#é.txt",
			options,
			async () => {}
		);
		const dispatch = vi.spyOn(mf, "dispatchFetch");
		try {
			const result = await uploadMultipartFile(
				"source",
				async () => transport,
				new AbortController().signal
			);
			expect(result?.size).toBe(MULTIPART_PART_SIZE + 7);
			const bucket = await mf.getR2Bucket("BUCKET");
			const object = await bucket.head("folder/a ?#é.txt");
			expect(object?.httpMetadata).toEqual(options.httpMetadata);
			// Local R2 does not emulate storage classes; check the creation request.
			expect(JSON.parse(String(dispatch.mock.calls[0]?.[1]?.body))).toEqual({
				...options,
				httpMetadata: {
					...options.httpMetadata,
					cacheExpiry: options.httpMetadata.cacheExpiry.toISOString(),
				},
			});
			const hash = createHash("sha256");
			for await (const chunk of createReadStream("source")) {
				hash.update(chunk);
			}
			expect(result?.sha256).toBe(hash.digest("hex"));
		} finally {
			await mf.dispose();
		}
	});

	it("aborts an upload and exposes permanent R2 errors without retrying", async ({
		expect,
	}) => {
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				scriptPath: multipartWorkerPath,
				modulesRoot: dirname(multipartWorkerPath),
				r2Buckets: { BUCKET: "bucket" },
			})
		);
		const transport = createMultipartTransport(mf, "key", {}, async () =>
			mf.dispose()
		);
		const signal = new AbortController().signal;
		try {
			const uploadId = await transport.create(signal);
			await transport.abort(uploadId, signal);
			await expect(
				transport.uploadPart(
					uploadId,
					1,
					Readable.from([Buffer.from("body")]),
					4,
					signal
				)
			).rejects.toMatchObject({ status: 400 });
		} finally {
			await transport.dispose();
		}
	});
});
