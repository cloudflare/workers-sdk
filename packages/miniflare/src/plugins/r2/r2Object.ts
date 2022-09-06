import crypto from "crypto";
import { TextEncoder } from "util";
import { R2Objects, R2Range } from "./gateway";

const encoder = new TextEncoder();
export interface R2HTTPMetadata {
	contentType?: string;
	contentLanguage?: string;
	contentDisposition?: string;
	contentEncoding?: string;
	cacheControl?: string;
	cacheExpiry?: Date;
}

export interface R2ObjectMetadata {
	// The object’s key.
	key: string;
	// Random unique string associated with a specific upload of a key.
	version: string;
	// Size of the object in bytes.
	size: number;
	// The etag associated with the object upload.
	etag: string;
	// The object’s etag, in quotes so as to be returned as a header.
	httpEtag: string;
	// The time the object was uploaded.
	uploaded: number;
	// Various HTTP headers associated with the object. Refer to HTTP Metadata.
	httpMetadata: R2HTTPMetadata;
	// A map of custom, user-defined metadata associated with the object.
	customMetadata: Record<string, string>;
	// If a GET request was made with a range option, this will be added
	range?: R2Range;
}

// R2ObjectMetadata in the format the Workers Runtime expects to be returned
export interface RawR2ObjectMetadata
	extends Omit<R2ObjectMetadata, "key" | "httpMetadata" | "customMetadata"> {
	// The object’s name.
	name: string;
	// Various HTTP headers associated with the object. Refer to HTTP Metadata.
	httpFields: R2HTTPMetadata;
	// A map of custom, user-defined metadata associated with the object.
	customFields: { k: string; v: string }[];
}

interface EncodedMetadata {
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
	// The object’s key.
	key: string;
	// Random unique string associated with a specific upload of a key.
	version: string;
	// Size of the object in bytes.
	size: number;
	// The etag associated with the object upload.
	etag: string;
	// The object’s etag, in quotes so as to be returned as a header.
	httpEtag: string;
	// The time the object was uploaded.
	uploaded: number;
	// Various HTTP headers associated with the object. Refer to
	// https://developers.cloudflare.com/r2/runtime-apis/#http-metadata.
	httpMetadata: R2HTTPMetadata;
	// A map of custom, user-defined metadata associated with the object.
	customMetadata: Record<string, string>;
	// If a GET request was made with a range option, this will be added
	range?: R2Range;
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
	rawProperties(): RawR2ObjectMetadata {
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
		const json = JSON.stringify(this.rawProperties());
		const bytes = encoder.encode(json);
		return { metadataSize: bytes.length, value: bytes };
	}

	static encodeMultiple(objects: R2Objects): EncodedMetadata {
		const json = JSON.stringify({
			...objects,
			objects: objects.objects.map((o) => o.rawProperties()),
		});
		const bytes = encoder.encode(json);
		return { metadataSize: bytes.length, value: bytes };
	}
}

export class R2ObjectBody extends R2Object {
	body: Uint8Array;

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
