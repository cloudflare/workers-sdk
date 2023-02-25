import assert from "assert";
import crypto from "crypto";
import { TextEncoder } from "util";
import type { R2StringChecksums } from "@cloudflare/workers-types/experimental";
import { R2Objects } from "./gateway";
import {
	BASE64_REGEXP,
	HEX_REGEXP,
	R2HeadResponse,
	R2HttpFields,
	R2Range,
} from "./schemas";

const encoder = new TextEncoder();

export interface R2ObjectMetadata {
	// The object’s key.
	key: string;
	// Random unique string associated with a specific upload of a key.
	version: string;
	// Size of the object in bytes.
	size: number;
	// The etag associated with the object upload.
	etag: string;
	// The object's etag, in quotes to be returned as a header.
	httpEtag: string;
	// The time the object was uploaded.
	uploaded: number;
	// Various HTTP headers associated with the object. Refer to HTTP Metadata:
	// https://developers.cloudflare.com/r2/runtime-apis/#http-metadata.
	httpMetadata: R2HttpFields;
	// A map of custom, user-defined metadata associated with the object.
	customMetadata: Record<string, string>;
	// If a GET request was made with a range option, this will be added
	range?: R2Range;
	// Hashes used to check the received object’s integrity. At most one can be
	// specified.
	checksums?: R2StringChecksums;
}

export interface EncodedMetadata {
	metadataSize: number;
	value: Uint8Array;
}

export function createVersion(): string {
	return crypto.randomBytes(24).toString("base64");
}

/**
 * R2Object is created when you PUT an object into an R2 bucket.
 * R2Object represents the metadata of an object based on the information
 * provided by the uploader. Every object that you PUT into an R2 bucket
 * will have an R2Object created.
 */
export class R2Object implements R2ObjectMetadata {
	readonly key: string;
	readonly version: string;
	readonly size: number;
	readonly etag: string;
	readonly httpEtag: string;
	readonly uploaded: number;
	readonly httpMetadata: R2HttpFields;
	readonly customMetadata: Record<string, string>;
	readonly range?: R2Range;
	readonly checksums: R2StringChecksums;

	constructor(metadata: R2ObjectMetadata) {
		this.key = metadata.key;
		this.version = metadata.version;
		this.size = metadata.size;
		this.etag = metadata.etag;
		this.httpEtag = metadata.httpEtag;
		this.uploaded = metadata.uploaded;
		this.httpMetadata = metadata.httpMetadata;
		this.customMetadata = metadata.customMetadata;
		this.range = metadata.range;

		// For non-multipart uploads, we always need to store an MD5 hash in
		// `checksums`, but never explicitly stored one. Luckily, `R2Bucket#put()`
		// always makes `etag` an MD5 hash.
		const checksums: R2StringChecksums = { ...metadata.checksums };
		const etag = metadata.etag;
		if (etag.length === 32 && HEX_REGEXP.test(etag)) {
			checksums.md5 = metadata.etag;
		} else if (etag.length === 24 && BASE64_REGEXP.test(etag)) {
			// TODO: remove this when we switch underlying storage mechanisms
			// Previous versions of Miniflare 3 base64 encoded `etag` instead
			checksums.md5 = Buffer.from(etag, "base64").toString("hex");
		} else {
			assert.fail("Expected `etag` to be an MD5 hash");
		}
		this.checksums = checksums;
	}

	// Format for return to the Workers Runtime
	#rawProperties(): R2HeadResponse {
		return {
			...this,
			name: this.key,
			httpFields: this.httpMetadata,
			customFields: Object.entries(this.customMetadata).map(([k, v]) => ({
				k,
				v,
			})),
			checksums: {
				0: this.checksums.md5,
				1: this.checksums.sha1,
				2: this.checksums.sha256,
				3: this.checksums.sha384,
				4: this.checksums.sha512,
			},
		};
	}

	encode(): EncodedMetadata {
		const json = JSON.stringify(this.#rawProperties());
		const bytes = encoder.encode(json);
		return { metadataSize: bytes.length, value: bytes };
	}

	static encodeMultiple(objects: R2Objects): EncodedMetadata {
		const json = JSON.stringify({
			...objects,
			objects: objects.objects.map((o) => o.#rawProperties()),
		});
		const bytes = encoder.encode(json);
		return { metadataSize: bytes.length, value: bytes };
	}
}

export class R2ObjectBody extends R2Object {
	readonly body: Uint8Array;

	constructor(metadata: R2ObjectMetadata, body: Uint8Array) {
		super(metadata);
		this.body = body;
	}

	encode(): EncodedMetadata {
		const { metadataSize, value: metadata } = super.encode();
		const merged = new Uint8Array(metadataSize + this.body.length);
		merged.set(metadata);
		merged.set(this.body, metadataSize);
		return {
			metadataSize: metadataSize,
			value: merged,
		};
	}
}
