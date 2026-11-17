import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { setTimeout } from "node:timers/promises";
import { UserError } from "@cloudflare/workers-utils";
import { logger } from "../../logger";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";

export const MULTIPART_PART_SIZE = 90 * 1024 * 1024;
export const MULTIPART_MAX_PARTS = 10_000;

interface UploadedPart {
	partNumber: number;
	etag: string;
}

interface CompletedObject {
	size: number;
	etag: string;
}

/** Internal transport contract, shared by the uploader and the HTTP adapter. */
export interface MultipartTransport {
	create(signal: AbortSignal): Promise<string>;
	uploadPart(
		uploadId: string,
		partNumber: number,
		body: Readable,
		size: number,
		signal: AbortSignal
	): Promise<UploadedPart>;
	complete(
		uploadId: string,
		parts: UploadedPart[],
		signal: AbortSignal
	): Promise<CompletedObject>;
	get(
		signal: AbortSignal
	): Promise<{ body: AsyncIterable<Uint8Array>; size: number; etag: string }>;
	abort(uploadId: string, signal: AbortSignal): Promise<void>;
	dispose(): Promise<void>;
}

/** A response failure whose status determines whether a part can be retried. */
export class MultipartRequestError extends UserError {
	constructor(
		message: string,
		readonly status: number,
		readonly retryAfterMs = 0
	) {
		super(message, { telemetryMessage: "r2 multipart request failed" });
	}
}

function canRetry(error: unknown): boolean {
	if (error instanceof MultipartRequestError) {
		return error.status === 429 || error.status >= 500;
	}
	if (error instanceof Error) {
		const code = "code" in error ? error.code : undefined;
		if (
			typeof code === "string" &&
			/^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/.test(
				code
			)
		) {
			return true;
		}
		return canRetry(error.cause);
	}
	return false;
}

function unchanged(before: Stats, after: Stats): boolean {
	return (
		before.size === after.size &&
		before.mtimeMs === after.mtimeMs &&
		before.ctimeMs === after.ctimeMs
	);
}

/** Reads a replayable range without allowing stream cancellation to close the shared file handle. */
async function* readRange(
	handle: FileHandle,
	start: number,
	size: number,
	signal: AbortSignal
): AsyncGenerator<Buffer> {
	for (let offset = 0; offset < size;) {
		signal.throwIfAborted();
		const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size - offset));
		const { bytesRead } = await handle.read(
			buffer,
			0,
			buffer.length,
			start + offset
		);
		if (bytesRead === 0) {
			throw new UserError(
				"The source file was truncated during multipart upload.",
				{ telemetryMessage: "r2 multipart file truncated" }
			);
		}
		offset += bytesRead;
		yield buffer.subarray(0, bytesRead);
	}
}

/**
 * Uploads a regular file in bounded-memory parts and verifies a full readback.
 * The transport is created only after validating and hashing the source file.
 * Returning undefined from the factory cancels without creating an upload.
 */
export async function uploadMultipartFile(
	file: string,
	createTransport: () => Promise<MultipartTransport | undefined>,
	signal: AbortSignal
): Promise<{ size: number; sha256: string } | undefined> {
	const handle = await open(
		file,
		constants.O_RDONLY | constants.O_NONBLOCK
	).catch((cause: unknown) => {
		throw new UserError(`Could not open the multipart source file "${file}".`, {
			cause,
			telemetryMessage: "r2 multipart file open failed",
		});
	});
	let transport: MultipartTransport | undefined;
	let uploadId: string | undefined;
	let completed = false;
	let completionStarted = false;
	let creationStarted = false;
	try {
		const initial = await handle.stat();
		if (!initial.isFile() || initial.size === 0) {
			throw new UserError(
				"Multipart upload requires a non-empty regular file.",
				{ telemetryMessage: "r2 multipart file invalid" }
			);
		}
		if (Math.ceil(initial.size / MULTIPART_PART_SIZE) > MULTIPART_MAX_PARTS) {
			throw new UserError(
				`Multipart upload supports at most ${MULTIPART_MAX_PARTS} parts of 90 MiB (${MULTIPART_PART_SIZE * MULTIPART_MAX_PARTS} bytes).`,
				{ telemetryMessage: "r2 multipart file too large" }
			);
		}
		logger.log("Computing source file SHA-256...");
		const hash = createHash("sha256");
		for await (const chunk of readRange(handle, 0, initial.size, signal)) {
			hash.update(chunk);
		}
		const sha256 = hash.digest("hex");
		const assertUnchanged = async () => {
			if (!unchanged(initial, await handle.stat())) {
				throw new UserError(
					"The source file changed during multipart upload. Retry with a file that is not being modified.",
					{ telemetryMessage: "r2 multipart file changed" }
				);
			}
		};
		await assertUnchanged();
		signal.throwIfAborted();
		transport = await createTransport();
		if (transport === undefined) {
			return;
		}
		signal.throwIfAborted();
		creationStarted = true;
		uploadId = await transport.create(signal);
		const parts: UploadedPart[] = [];
		const partCount = Math.ceil(initial.size / MULTIPART_PART_SIZE);
		for (let partNumber = 1; partNumber <= partCount; partNumber++) {
			const start = (partNumber - 1) * MULTIPART_PART_SIZE;
			const size = Math.min(MULTIPART_PART_SIZE, initial.size - start);
			for (let attempt = 0; ; attempt++) {
				signal.throwIfAborted();
				const body = Readable.from(readRange(handle, start, size, signal), {
					objectMode: false,
					signal,
				});
				try {
					parts.push(
						await transport.uploadPart(uploadId, partNumber, body, size, signal)
					);
					break;
				} catch (error) {
					if (signal.aborted || attempt >= 3 || !canRetry(error)) {
						throw error;
					}
					const retryAfter =
						error instanceof MultipartRequestError ? error.retryAfterMs : 0;
					logger.warn(
						`Retrying multipart part ${partNumber} (attempt ${attempt + 2}/4).`
					);
					body.destroy();
					await setTimeout(
						Math.max(retryAfter, 1000 * 2 ** attempt * (0.5 + Math.random())),
						undefined,
						{ signal }
					);
				} finally {
					body.destroy();
				}
			}
			logger.log(`Uploaded part ${partNumber}/${partCount}.`);
		}
		await assertUnchanged();
		completionStarted = true;
		const object = await transport.complete(uploadId, parts, signal);
		completed = true;
		logger.log("Verifying uploaded object size and SHA-256...");
		const remote = await transport.get(signal);
		const remoteHash = createHash("sha256");
		let size = 0;
		for await (const chunk of remote.body) {
			signal.throwIfAborted();
			size += chunk.byteLength;
			remoteHash.update(chunk);
		}
		const remoteSha256 = remoteHash.digest("hex");
		if (
			size !== initial.size ||
			remote.size !== size ||
			object.size !== size ||
			remote.etag !== object.etag ||
			remoteSha256 !== sha256
		) {
			throw new UserError(
				`The uploaded object's size, ETag or SHA-256 does not match the source file. Expected ${initial.size} bytes and SHA-256 ${sha256}; read ${size} bytes with SHA-256 ${remoteSha256}. Completion reported ${object.size} bytes; readback reported ${remote.size} bytes. ETag changed: ${remote.etag !== object.etag}.`,
				{ telemetryMessage: "r2 multipart verification failed" }
			);
		}
		return { size, sha256 };
	} catch (error) {
		if (creationStarted && uploadId === undefined) {
			logger.warn(
				"Multipart creation did not return an upload ID. An incomplete upload may remain until the bucket's abort-multipart lifecycle rule removes it."
			);
		}
		if (transport !== undefined && uploadId !== undefined && !completed) {
			try {
				await transport.abort(uploadId, AbortSignal.timeout(10_000));
			} catch {
				logger.warn(
					`Could not confirm multipart cleanup for upload ${uploadId}. Incomplete parts may remain until the bucket's abort-multipart lifecycle rule removes them.`
				);
			}
		}
		if (completionStarted) {
			logger.warn(
				"The object may already be published. It has not been deleted; verify it before retrying."
			);
		}
		throw error;
	} finally {
		try {
			await handle.close();
		} catch {
			logger.warn("Could not close the multipart source file.");
		}
		if (transport !== undefined) {
			try {
				await transport.dispose();
			} catch {
				logger.warn("Could not confirm remote multipart session cleanup.");
			}
		}
	}
}
