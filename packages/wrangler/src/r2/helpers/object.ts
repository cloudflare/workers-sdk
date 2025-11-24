import {
	bucketFormatMessage,
	FatalError,
	isValidR2BucketName,
	UserError,
} from "@cloudflare/workers-utils";
import { Miniflare } from "miniflare";
import prettyBytes from "pretty-bytes";
import { fetchR2Objects } from "../../cfetch/internal";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { getDefaultPersistRoot } from "../../dev/miniflare";
import { MAX_UPLOAD_SIZE_BYTES } from "../constants";
import type { R2Bucket } from "@cloudflare/workers-types/experimental";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";
import type { ReplaceWorkersTypes } from "miniflare";
import type { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { HeadersInit } from "undici";

/**
 * Downloads an object
 */
export async function getR2Object(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	objectName: string,
	jurisdiction?: string
): Promise<ReadableStream | null> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const response = await fetchR2Objects(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			method: "GET",
			headers,
		}
	);

	return response === null ? null : response.body;
}

/**
 * Validate upload size.
 *
 * Throws a FatalError if the size exceeds the maximum allowed upload size.
 *
 * @param sizeBytes the size of the object to upload in bytes
 */
export function validateUploadSize(key: string, sizeBytes: number): void {
	if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
		throw new FatalError(
			`Error: Wrangler only supports uploading files up to ${prettyBytes(
				MAX_UPLOAD_SIZE_BYTES,
				{ binary: true }
			)} in size\n${key} is ${prettyBytes(sizeBytes, {
				binary: true,
			})} in size`,
			1
		);
	}
}

const putHeaderKeys = [
	"cache-control",
	"content-disposition",
	"content-encoding",
	"content-language",
	"content-length",
	"content-type",
	"expires",
] as const;

/**
 * Uploads an object to remote R2
 */
export async function putRemoteObject(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	objectName: string,
	object: Readable | ReadableStream | Buffer,
	options: Record<(typeof putHeaderKeys)[number], string | undefined>,
	jurisdiction?: string,
	storageClass?: string
): Promise<void> {
	const headers: HeadersInit = {};
	for (const key of putHeaderKeys) {
		const value = options[key] || "";
		if (value && typeof value === "string") {
			headers[key] = value;
		}
	}
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	if (storageClass !== undefined) {
		headers["cf-r2-storage-class"] = storageClass;
	}

	const result = await fetchR2Objects(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			body: object,
			headers,
			method: "PUT",
			duplex: "half",
		}
	);
	if (result === null) {
		throw new UserError("The specified bucket does not exist.");
	}
}
/**
 * Delete an Object
 */
export async function deleteR2Object(
	complianceConfig: ComplianceConfig,
	accountId: string,
	bucketName: string,
	objectName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	await fetchR2Objects(
		complianceConfig,
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{ method: "DELETE", headers }
	);
}

export async function usingLocalBucket<T>(
	persistTo: string | undefined,
	config: Config,
	bucketName: string,
	closure: (
		namespace: ReplaceWorkersTypes<R2Bucket>,
		mf: Miniflare
	) => Promise<T>
): Promise<T> {
	const persist = getLocalPersistencePath(persistTo, config);
	const defaultPersistRoot = getDefaultPersistRoot(persist);
	const mf = new Miniflare({
		modules: true,
		// TODO(soon): import `reduceError()` from `miniflare:shared`
		script: `
    function reduceError(e) {
      return {
        name: e?.name,
        message: e?.message ?? String(e),
        stack: e?.stack,
        cause: e?.cause === undefined ? undefined : reduceError(e.cause),
      };
    }
    export default {
      async fetch(request, env, ctx) {
        try {
          if (request.method !== "PUT") return new Response(null, { status: 405 });
          const url = new URL(request.url);
          const key = url.pathname.substring(1);
          const optsHeader = request.headers.get("Wrangler-R2-Put-Options");
          const opts = JSON.parse(optsHeader);
          await env.BUCKET.put(key, request.body, opts);
          return new Response(null, { status: 204 });
        } catch (e) {
          const error = reduceError(e);
          return Response.json(error, {
            status: 500,
            headers: { "MF-Experimental-Error-Stack": "true" },
          });
        }
      }
    }`,
		defaultPersistRoot,
		r2Buckets: { BUCKET: bucketName },
	});
	const bucket = await mf.getR2Bucket("BUCKET");
	try {
		return await closure(bucket, mf);
	} finally {
		await mf.dispose();
	}
}

/**
 * Extract the bucket and key from an object path, validating the bucket name in the process.
 *
 * Throws when an invalid format is provided or when the bucket name is invalid.
 *
 * @param objectPath The path passed to wrangler commands in the format `{bucket}/{key}`
 * @returns The bucket and key extracted from the object path
 */
export function validateAndReturnBucketAndKey(objectPath: string): {
	bucket: string;
	key: string;
} {
	// Path format is `<bucket>/<key>`
	const match = /^(?<bucket>[^/]+)\/(?<key>.*)/.exec(objectPath);
	if (match === null || !match.groups) {
		throw new UserError(
			`The object path must be in the form of {bucket}/{key} you provided ${objectPath}`
		);
	}
	const { bucket, key } = match.groups;
	if (!isValidR2BucketName(bucket)) {
		throw new UserError(
			`The bucket name "${bucket}" is invalid. ${bucketFormatMessage}`
		);
	}

	return { bucket, key };
}
