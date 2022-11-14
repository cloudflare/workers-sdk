import assert from "assert";
import { Blob } from "buffer";
import { BodyInit, FormData, Response } from "undici";
import { z } from "zod";
import { Clock, millisToSeconds } from "../../shared";
import {
	RemoteStorage,
	StorageListOptions,
	StorageListResult,
	StoredValueMeta,
} from "../../storage";
import { KVError } from "./gateway";

interface RemoteCacheMetadata {
	// UNIX timestamp in seconds when this key was last modified. KV allows you
	// to reduce the cache TTL if it was previously set too high
	// (https://developers.cloudflare.com/workers/runtime-apis/kv/#cache-ttl).
	// This is used to check if the data should be revalidated from the remote.
	storedAt: number;
	// Whether this key represents a deleted value and should be treated as
	// `undefined`.
	tombstone?: true;
	// The actual user-specified expiration of this key, if any. We want to return
	// this to users instead of our cache expiration.
	actualExpiration?: number;
	// The actual user-specified metadata of this key, if any. We want to return
	// this to users instead of this object.
	actualMetadata?: unknown;
}

const APIEnvelopeSchema = z.object({
	success: z.boolean(),
	errors: z.array(z.object({ code: z.number(), message: z.string() })),
	messages: z.array(z.object({ code: z.number(), message: z.string() })),
});

const KVGetMetadataResponseSchema = z.intersection(
	APIEnvelopeSchema,
	z.object({ result: z.unknown() })
);

const KVListResponseSchema = z.intersection(
	APIEnvelopeSchema,
	z.object({
		result: z.array(
			z.object({
				name: z.string(),
				expiration: z.onumber(),
				metadata: z.unknown(),
			})
		),
		result_info: z.optional(
			z.object({
				count: z.onumber(),
				cursor: z.ostring(),
			})
		),
	})
);

async function assertSuccessfulResponse(response: Response) {
	if (response.ok) return;

	// If this wasn't a successful response, throw a KVError
	const contentType = response.headers.get("Content-Type");
	if (contentType?.toLowerCase().includes("application/json")) {
		const envelope = APIEnvelopeSchema.parse(await response.json());
		throw new KVError(
			response.status,
			envelope.errors.map(({ message }) => message).join("\n")
		);
	} else {
		throw new KVError(response.status, await response.text());
	}
}

const DEFAULT_CACHE_TTL = 60;
// Returns seconds since UNIX epoch key should expire, using the specified
// expiration only if it is sooner than the cache TTL
function getCacheExpiration(
	clock: Clock,
	expiration?: number,
	cacheTtl = DEFAULT_CACHE_TTL
): number {
	// Return minimum expiration
	const cacheExpiration = millisToSeconds(clock()) + cacheTtl;
	if (expiration === undefined || isNaN(expiration)) return cacheExpiration;
	else return Math.min(cacheExpiration, expiration);
}

export class KVRemoteStorage extends RemoteStorage {
	async get(
		key: string,
		skipMetadata?: boolean,
		cacheTtl = DEFAULT_CACHE_TTL
	): Promise<StoredValueMeta | undefined> {
		// If this key is cached, return it
		const cachedValue = await this.cache.get<RemoteCacheMetadata>(key);
		if (cachedValue?.metadata?.storedAt !== undefined) {
			// cacheTtl may have changed between the original get call that cached
			// this value and now, so check the cache is still fresh with the new TTL
			const newExpiration = cachedValue.metadata.storedAt + cacheTtl;
			if (newExpiration >= millisToSeconds(this.clock())) {
				// If the cache is still fresh, update the expiration and return
				await this.cache.put<RemoteCacheMetadata>(key, {
					value: cachedValue.value,
					expiration: newExpiration,
					// Intentionally not updating storedAt here, future get()s should
					// compare their cacheTtl against the original
					metadata: cachedValue.metadata,
				});

				// If we recently deleted this key, we'll cache a tombstone instead,
				// and want to return undefined in that case
				if (cachedValue.metadata.tombstone) return undefined;
				return {
					value: cachedValue.value,
					expiration: cachedValue.metadata.actualExpiration,
					metadata: cachedValue.metadata.actualMetadata,
				};
			}
			// Otherwise, revalidate...
		}

		// Otherwise, fetch the key...
		const encodedKey = encodeURIComponent(key);
		const valueResource = `storage/kv/namespaces/${this.namespace}/values/${encodedKey}`;
		const metadataResource = `storage/kv/namespaces/${this.namespace}/metadata/${encodedKey}`;
		const [valueResponse, metadataResponse] = await Promise.all([
			this.cloudflareFetch(valueResource),
			this.cloudflareFetch(metadataResource),
		]);
		if (valueResponse.status === 404) {
			// Don't cache not founds, so new keys always returned instantly
			return undefined;
		}
		await assertSuccessfulResponse(valueResponse);
		await assertSuccessfulResponse(metadataResponse);

		const value = new Uint8Array(await valueResponse.arrayBuffer());
		const metadataEnvelope = KVGetMetadataResponseSchema.parse(
			await metadataResponse.json()
		);
		assert(metadataEnvelope.success);
		// The API will return null if there's no metadata, but we treat this as
		// undefined
		const metadata = metadataEnvelope.result ?? undefined;

		const expirationHeader = valueResponse.headers.get("Expiration");
		let expiration: number | undefined;
		if (expirationHeader !== null) {
			const maybeExpiration = parseInt(expirationHeader);
			if (!isNaN(maybeExpiration)) expiration = maybeExpiration;
		}

		// ...and cache it for the specified TTL, then return it
		const result: StoredValueMeta = { value, expiration, metadata };
		await this.cache.put<RemoteCacheMetadata>(key, {
			value: result.value,
			expiration: getCacheExpiration(this.clock, expiration, cacheTtl),
			metadata: {
				storedAt: millisToSeconds(this.clock()),
				actualExpiration: result.expiration,
				actualMetadata: result.metadata,
			},
		});
		return result;
	}

	async put(key: string, value: StoredValueMeta): Promise<void> {
		// Store new value, expiration and metadata in remote
		const encodedKey = encodeURIComponent(key);
		const resource = `storage/kv/namespaces/${this.namespace}/values/${encodedKey}`;

		const searchParams = new URLSearchParams();
		if (value.expiration !== undefined) {
			// Send expiration as TTL to avoid "expiration times must be at least 60s
			// in the future" issues from clock skew when setting `expirationTtl: 60`.
			const desiredTtl = value.expiration - millisToSeconds(this.clock());
			const ttl = Math.max(desiredTtl, 60);
			searchParams.set("expiration_ttl", ttl.toString());
		}

		let body: BodyInit = value.value;
		if (value.metadata !== undefined) {
			body = new FormData();
			body.set("value", new Blob([value.value]));
			body.set("metadata", JSON.stringify(value.metadata));
		}

		const response = await this.cloudflareFetch(resource, searchParams, {
			method: "PUT",
			body,
		});
		await assertSuccessfulResponse(response);

		// Store this value in the cache
		await this.cache.put<RemoteCacheMetadata>(key, {
			value: value.value,
			expiration: getCacheExpiration(this.clock, value.expiration),
			metadata: {
				storedAt: millisToSeconds(this.clock()),
				actualExpiration: value.expiration,
				actualMetadata: value.metadata,
			},
		});
	}

	async delete(key: string): Promise<boolean> {
		// Delete key from remote
		const encodedKey = encodeURIComponent(key);
		const resource = `storage/kv/namespaces/${this.namespace}/values/${encodedKey}`;

		const response = await this.cloudflareFetch(resource, undefined, {
			method: "DELETE",
		});
		await assertSuccessfulResponse(response);

		// "Store" delete in cache as tombstone
		await this.cache.put<RemoteCacheMetadata>(key, {
			value: new Uint8Array(),
			expiration: getCacheExpiration(this.clock),
			metadata: { storedAt: millisToSeconds(this.clock()), tombstone: true },
		});

		// Technically, it's incorrect to always say we deleted the key by returning
		// true here, as the value may not exist in the remote. However, `KVGateway`
		// ignores this result anyway.
		return true;
	}

	async list(options: StorageListOptions): Promise<StorageListResult> {
		// Always list from remote, ignore cache
		const resource = `storage/kv/namespaces/${this.namespace}/keys`;
		const searchParams = new URLSearchParams();
		if (options.limit !== undefined) {
			searchParams.set("limit", options.limit.toString());
		}
		if (options.cursor !== undefined) {
			searchParams.set("cursor", options.cursor.toString());
		}
		if (options.prefix !== undefined) {
			searchParams.set("prefix", options.prefix.toString());
		}

		// Make sure unsupported options aren't specified
		assert.strictEqual(options.start, undefined);
		assert.strictEqual(options.end, undefined);
		assert.strictEqual(options.reverse, undefined);
		assert.strictEqual(options.delimiter, undefined);

		const response = await this.cloudflareFetch(resource, searchParams);
		await assertSuccessfulResponse(response);
		const value = KVListResponseSchema.parse(await response.json());
		assert(value.success);

		return {
			keys: value.result,
			cursor: value.result_info?.cursor ?? "",
		};
	}

	has(): never {
		assert.fail("KVGateway should not call has()");
	}
	head(): never {
		assert.fail("KVGateway should not call head()");
	}
	getRange(): never {
		assert.fail("KVGateway should not call getRange()");
	}
}
