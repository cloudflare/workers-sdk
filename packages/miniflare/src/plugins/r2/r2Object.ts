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
