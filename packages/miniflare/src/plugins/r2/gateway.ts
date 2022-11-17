import { Log } from "../../shared";
import { RangeStoredValueMeta, Storage } from "../../storage";
import { InvalidRange, NoSuchKey } from "./errors";
import {
	R2HTTPMetadata,
	R2Object,
	R2ObjectBody,
	R2ObjectMetadata,
	createVersion,
} from "./r2Object";
import { Validator } from "./validator";

// For more information, refer to https://datatracker.ietf.org/doc/html/rfc7232
export interface R2Conditional {
	// Performs the operation if the object’s etag matches the given string.
	etagMatches?: string;
	// Performs the operation if the object’s etag does not match the given string.
	etagDoesNotMatch?: string;
	// Performs the operation if the object was uploaded before the given date.
	uploadedBefore?: number;
	// Performs the operation if the object was uploaded after the given date.
	uploadedAfter?: number;
}

export interface R2Range {
	offset?: number;
	length?: number;
	suffix?: number;
}

export interface R2GetOptions {
	// Specifies that the object should only be returned given satisfaction of
	// certain conditions in the R2Conditional. Refer to R2Conditional above.
	onlyIf?: R2Conditional;
	// Specifies that only a specific length (from an optional offset) or suffix
	// of bytes from the object should be returned. Refer to
	// https://developers.cloudflare.com/r2/runtime-apis/#ranged-reads.
	range?: R2Range;
}

export interface R2PutOptions {
	// Various HTTP headers associated with the object. Refer to
	// https://developers.cloudflare.com/r2/runtime-apis/#http-metadata.
	httpMetadata: R2HTTPMetadata;
	// A map of custom, user-defined metadata that will be stored with the object.
	customMetadata: Record<string, string>;
	// A md5 hash to use to check the recieved object’s integrity.
	md5?: string;
}

export type R2ListOptionsInclude = ("httpMetadata" | "customMetadata")[];

export interface R2ListOptions {
	// The number of results to return. Defaults to 1000, with a maximum of 1000.
	limit?: number;
	// The prefix to match keys against. Keys will only be returned if they start with given prefix.
	prefix?: string;
	// An opaque token that indicates where to continue listing objects from.
	// A cursor can be retrieved from a previous list operation.
	cursor?: string;
	// The character to use when grouping keys.
	delimiter?: string;
	// Can include httpFields and/or customFields. If included, items returned by
	// the list will include the specified metadata. Note that there is a limit on the
	// total amount of data that a single list operation can return.
	// If you request data, you may recieve fewer than limit results in your response
	// to accomodate metadata.
	// Use the truncated property to determine if the list request has more data to be returned.
	include?: R2ListOptionsInclude;
}

export interface R2Objects {
	// An array of objects matching the list request.
	objects: R2Object[];
	// If true, indicates there are more results to be retrieved for the current list request.
	truncated: boolean;
	// A token that can be passed to future list calls to resume listing from that point.
	// Only present if truncated is true.
	cursor?: string;
	// If a delimiter has been specified, contains all prefixes between the specified
	// prefix and the next occurence of the delimiter.
	// For example, if no prefix is provided and the delimiter is ‘/’, foo/bar/baz
	// would return foo as a delimited prefix. If foo/ was passed as a prefix
	// with the same structure and delimiter, foo/bar would be returned as a delimited prefix.
	delimitedPrefixes: string[];
}

const MAX_LIST_KEYS = 1_000;
// https://developers.cloudflare.com/r2/platform/limits/ (5GB - 5MB)

const validate = new Validator();

export class R2Gateway {
	constructor(
		private readonly log: Log,
		private readonly storage: Storage
	) {}

	async head(key: string): Promise<R2Object> {
		validate.key(key);

		// Get value, returning null if not found
		const stored = await this.storage.head<R2ObjectMetadata>(key);

		if (stored?.metadata === undefined) throw new NoSuchKey();
		const { metadata } = stored;

		return new R2Object(metadata);
	}

	async get(
		key: string,
		options: R2GetOptions = {}
	): Promise<R2ObjectBody | R2Object> {
		const { range = {}, onlyIf } = options;
		validate
			.key(key)
			.getOptions(options)
			.condition(await this.head(key), onlyIf);

		let stored: RangeStoredValueMeta<R2ObjectMetadata> | undefined;

		// get data dependent upon whether suffix or range exists
		try {
			stored = await this.storage.getRange<R2ObjectMetadata>(key, range);
		} catch {
			throw new InvalidRange();
		}
		if (stored?.metadata === undefined) throw new NoSuchKey();
		const { value, metadata } = stored;
		// add range should it exist
		if ("range" in stored && stored.range !== undefined) {
			metadata.range = stored.range;
		}

		return new R2ObjectBody(metadata, value);
	}

	async put(
		key: string,
		value: Uint8Array,
		options: R2PutOptions
	): Promise<R2Object> {
		const { customMetadata, md5, httpMetadata } = options;

		const hash = validate
			.key(key)
			.putOptions(options)
			.size(value)
			.md5(value, md5);

		// build metadata
		const metadata: R2ObjectMetadata = {
			key,
			size: value.byteLength,
			etag: hash,
			version: createVersion(),
			httpEtag: `"${hash}"`,
			uploaded: Date.now(),
			httpMetadata,
			customMetadata,
		};

		// Store value with expiration and metadata
		await this.storage.put<R2ObjectMetadata>(key, {
			value,
			metadata,
		});

		return new R2Object(metadata);
	}

	async delete(key: string) {
		validate.key(key);
		await this.storage.delete(key);
	}

	async list(listOptions: R2ListOptions = {}): Promise<R2Objects> {
		const delimitedPrefixes = new Set<string>();

		validate.listOptions(listOptions);

		const { prefix = "", include = [], cursor = "" } = listOptions;
		let { delimiter, limit = MAX_LIST_KEYS } = listOptions;
		if (delimiter === "") delimiter = undefined;

		// if include contains inputs, we reduce the limit to max 100
		if (include.length > 0) limit = Math.min(limit, 100);

		const res = await this.storage.list<R2ObjectMetadata>({
			prefix,
			limit,
			cursor,
			delimiter,
		});
		// add delimited prefixes should they exist
		for (const dP of res.delimitedPrefixes ?? []) delimitedPrefixes.add(dP);

		const objects = res.keys
			// grab metadata
			.map((k) => k.metadata)
			// filter out objects that exist within the delimiter
			.filter(
				(metadata): metadata is R2ObjectMetadata => metadata !== undefined
			)
			// filter "httpFields" and/or "customFields" if found in "include"
			.map((metadata) => {
				if (!include.includes("httpMetadata")) metadata.httpMetadata = {};
				if (!include.includes("customMetadata")) metadata.customMetadata = {};

				return new R2Object(metadata);
			});

		const cursorLength = res.cursor.length > 0;
		return {
			objects,
			truncated: cursorLength,
			cursor: cursorLength ? res.cursor : undefined,
			delimitedPrefixes: [...delimitedPrefixes],
		};
	}
}
