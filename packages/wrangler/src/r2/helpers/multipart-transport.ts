import { dirname } from "node:path";
import { Readable } from "node:stream";
import { UserError } from "@cloudflare/workers-utils";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import multipartWorkerPath from "worker:r2-multipart";
import { z } from "zod";
import { startRemoteProxySession } from "../../api/remoteBindings/start-remote-proxy-session";
import { requireApiToken, requireAuth } from "../../user";
import { MultipartRequestError } from "./multipart";
import type { MultipartTransport } from "./multipart";
import type { R2MultipartOptions } from "@cloudflare/workers-types";
import type { Config } from "@cloudflare/workers-utils";

const uploadedPart = z.object({
	partNumber: z.number().int().positive(),
	etag: z.string(),
});
const completedObject = z.object({
	size: z.number().nonnegative(),
	etag: z.string(),
});

/** Creates an HTTP adapter over a Miniflare R2 binding, also usable in local integration tests. */
export function createMultipartTransport(
	mf: Miniflare,
	key: string,
	options: R2MultipartOptions,
	dispose: () => Promise<void>
): MultipartTransport {
	async function request(
		method: string,
		signal: AbortSignal,
		params: Record<string, string> = {},
		body?: string | Readable,
		size?: number
	) {
		const url = new URL("http://localhost/");
		url.search = new URLSearchParams({ key, ...params }).toString();
		const response = await mf.dispatchFetch(url, {
			method,
			signal,
			body,
			duplex: "half",
			headers: size === undefined ? {} : { "Content-Length": String(size) },
		});
		if (!response.ok) {
			const message = await response.text();
			const retryAfter = response.headers.get("Retry-After");
			const seconds = retryAfter === null ? NaN : Number(retryAfter);
			const retryAfterMs =
				retryAfter === null
					? 0
					: Number.isFinite(seconds)
						? seconds * 1000
						: Date.parse(retryAfter) - Date.now();
			throw new MultipartRequestError(
				`R2 multipart request failed (${response.status}): ${message}`,
				response.status,
				Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs) : 0
			);
		}
		return response;
	}
	return {
		async create(signal) {
			const response = await request(
				"POST",
				signal,
				{},
				JSON.stringify(options)
			);
			return z
				.object({ uploadId: z.string().min(1) })
				.parse(await response.json()).uploadId;
		},
		async uploadPart(uploadId, partNumber, body, size, signal) {
			const response = await request(
				"PUT",
				signal,
				{ uploadId, partNumber: String(partNumber) },
				body,
				size
			);
			const part = uploadedPart.parse(await response.json());
			if (part.partNumber !== partNumber) {
				throw new Error("R2 returned an unexpected multipart part number.");
			}
			return part;
		},
		async complete(uploadId, parts, signal) {
			const response = await request(
				"POST",
				signal,
				{ uploadId },
				JSON.stringify(parts)
			);
			return completedObject.parse(await response.json());
		},
		async get(signal) {
			const response = await request("GET", signal);
			if (response.body === null) {
				throw new Error("R2 returned no object body for verification.");
			}
			return {
				body: Readable.fromWeb(response.body),
				// Streaming responses can lose Content-Length across the local proxy.
				size: z.coerce
					.number()
					.int()
					.nonnegative()
					.parse(response.headers.get("Wrangler-R2-Object-Size") ?? NaN),
				etag: response.headers.get("ETag") ?? "",
			};
		},
		async abort(uploadId, signal) {
			const response = await request("DELETE", signal, { uploadId });
			await response.body?.cancel();
		},
		dispose,
	};
}

/** Establishes an authenticated preview session scoped to the destination bucket. */
export async function createRemoteMultipartTransport(
	config: Config,
	bucket: string,
	key: string,
	options: R2MultipartOptions,
	jurisdiction?: string
): Promise<MultipartTransport> {
	const accountId = await requireAuth(config);
	const session = await startRemoteProxySession(
		{
			BUCKET: { type: "r2_bucket", bucket_name: bucket, jurisdiction },
		},
		{
			auth: async () => ({ accountId, apiToken: requireApiToken() }),
			complianceRegion: config.compliance_region,
		}
	).catch((cause: unknown) => {
		throw new UserError(
			"Could not establish the remote multipart connection. In addition to R2 access, this upload requires permission to create a Workers preview session. Check your authentication and token permissions.",
			{ cause, telemetryMessage: "r2 multipart connection failed" }
		);
	});
	let mf: Miniflare | undefined;
	try {
		mf = new Miniflare(
			convertV4MiniflareOptions({
				modules: true,
				scriptPath: multipartWorkerPath,
				modulesRoot: dirname(multipartWorkerPath),
				compatibilityDate: "2025-04-28",
				r2Buckets: {
					BUCKET: {
						id: bucket,
						remoteProxyConnectionString: session.remoteProxyConnectionString,
					},
				},
			})
		);
		await mf.ready;
		const runtime = mf;
		return createMultipartTransport(runtime, key, options, async () => {
			try {
				await runtime.dispose();
			} finally {
				await session.dispose();
			}
		});
	} catch (error) {
		try {
			try {
				await mf?.dispose();
			} finally {
				await session.dispose();
			}
		} catch {
			// Preserve the startup failure when cleanup also fails.
		}
		throw error;
	}
}
