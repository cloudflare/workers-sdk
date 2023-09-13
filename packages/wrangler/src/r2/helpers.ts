import path from "node:path";
import {
	R2Gateway,
	NoOpLog,
	createFileStorage,
	sanitisePath,
	defaultTimers,
} from "miniflare";
import { fetchResult } from "../cfetch";
import { fetchR2Objects } from "../cfetch/internal";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import type { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { HeadersInit } from "undici";

/**
 * Information about a bucket, returned from `listR2Buckets()`.
 */
export interface R2BucketInfo {
	name: string;
	creation_date: string;
}

/**
 * Fetch a list of all the buckets under the given `accountId`.
 */
export async function listR2Buckets(
	accountId: string,
	jurisdiction?: string
): Promise<R2BucketInfo[]> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const results = await fetchResult<{
		buckets: R2BucketInfo[];
	}>(`/accounts/${accountId}/r2/buckets`, { headers });
	return results.buckets;
}

/**
 * Create a bucket with the given `bucketName` within the account given by `accountId`.
 *
 * A 400 is returned if the account already owns a bucket with this name.
 * A bucket must be explicitly deleted to be replaced.
 */
export async function createR2Bucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(`/accounts/${accountId}/r2/buckets`, {
		method: "POST",
		body: JSON.stringify({ name: bucketName }),
		headers,
	});
}

/**
 * Delete a bucket with the given name
 */
export async function deleteR2Bucket(
	accountId: string,
	bucketName: string,
	jurisdiction?: string
): Promise<void> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return await fetchResult<void>(
		`/accounts/${accountId}/r2/buckets/${bucketName}`,
		{ method: "DELETE", headers }
	);
}

export function bucketAndKeyFromObjectPath(objectPath = ""): {
	bucket: string;
	key: string;
} {
	const match = /^([^/]+)\/(.*)/.exec(objectPath);
	if (match === null) {
		throw new Error(
			`The object path must be in the form of {bucket}/{key} you provided ${objectPath}`
		);
	}

	return { bucket: match[1], key: match[2] };
}

/**
 * Downloads an object
 */
export async function getR2Object(
	accountId: string,
	bucketName: string,
	objectName: string,
	jurisdiction?: string
): Promise<ReadableStream> {
	const headers: HeadersInit = {};
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	const response = await fetchR2Objects(
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			method: "GET",
			headers,
		}
	);

	return response.body;
}

/**
 * Uploads an object
 */
export async function putR2Object(
	accountId: string,
	bucketName: string,
	objectName: string,
	object: Readable | ReadableStream | Buffer,
	options: Record<string, unknown>,
	jurisdiction?: string
): Promise<void> {
	const headerKeys = [
		"content-length",
		"content-type",
		"content-disposition",
		"content-encoding",
		"content-language",
		"cache-control",
		"expires",
	];
	const headers: HeadersInit = {};
	for (const key of headerKeys) {
		const value = options[key] || "";
		if (value && typeof value === "string") headers[key] = value;
	}
	if (jurisdiction !== undefined) {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}

	await fetchR2Objects(
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{
			body: object,
			headers,
			method: "PUT",
			duplex: "half",
		}
	);
}
/**
 * Delete an Object
 */
export async function deleteR2Object(
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
		`/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectName}`,
		{ method: "DELETE", headers }
	);
}

export function localGateway(
	persistTo: string | undefined,
	configPath: string | undefined,
	bucketName: string
): R2Gateway {
	const persist = getLocalPersistencePath(persistTo, configPath);
	const sanitisedNamespace = sanitisePath(bucketName);
	const persistPath = path.join(persist, "v3/r2", sanitisedNamespace);
	const storage = createFileStorage(persistPath);
	return new R2Gateway(new NoOpLog(), storage, defaultTimers);
}
