import crypto from "crypto";
import { z } from "zod";
import { Log } from "../../shared";
import { RangeStoredValueMeta, Storage } from "../../storage";
import { _parseRanges } from "../shared";
import { InvalidRange, NoSuchKey } from "./errors";
import {
	R2Object,
	R2ObjectBody,
	R2ObjectMetadata,
	createVersion,
} from "./r2Object";
import {
	R2GetRequestSchema,
	R2ListRequestSchema,
	R2PutRequestSchema,
} from "./schemas";
import { MAX_LIST_KEYS, Validator } from "./validator";

export type OmitRequest<T> = Omit<T, "method" | "object">;
export type R2GetOptions = OmitRequest<z.infer<typeof R2GetRequestSchema>>;
export type R2PutOptions = OmitRequest<z.infer<typeof R2PutRequestSchema>>;
export type R2ListOptions = OmitRequest<z.infer<typeof R2ListRequestSchema>>;

export interface R2Objects {
	// An array of objects matching the list request.
	objects: R2Object[];
	// If true, indicates there are more results to be retrieved for the current
	// list request.
	truncated: boolean;
	// A token that can be passed to future list calls to resume listing from that
	// point.
	// Only present if truncated is true.
	cursor?: string;
	// If a delimiter has been specified, contains all prefixes between the
	// specified prefix and the next occurrence of the delimiter. For example, if
	// no prefix is provided and the delimiter is "/", "foo/bar/baz" would return
	// "foo" as a delimited prefix. If "foo/" was passed as a prefix with the same
	// structure and delimiter, "foo/bar" would be returned as a delimited prefix.
	delimitedPrefixes: string[];
}

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
		metadata.range = { offset: 0, length: metadata.size };

		return new R2Object(metadata);
	}

	async get(
		key: string,
		options: R2GetOptions = {}
	): Promise<R2ObjectBody | R2Object> {
		const meta = await this.head(key);
		validate.key(key).condition(meta, options.onlyIf);

		let range = options.range ?? {};
		if (options.rangeHeader !== undefined) {
			const ranges = _parseRanges(options.rangeHeader, meta.size);
			if (ranges?.length === 1) {
				// If the header contained a single range, convert it to an R2Range.
				// Note `start` and `end` are inclusive.
				const { start, end } = ranges[0];
				range = { offset: start, length: end - start + 1 };
			} else {
				// If the header was invalid, or contained multiple ranges, just return
				// the full response
				range = {};
			}
		}

		let stored: RangeStoredValueMeta<R2ObjectMetadata> | undefined;

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
		let meta: R2Object | undefined;
		try {
			meta = await this.head(key);
		} catch (e) {
			if (!(e instanceof NoSuchKey)) throw e;
		}
		const checksums = validate
			.key(key)
			.size(value)
			.metadataSize(options.customMetadata)
			.condition(meta, options.onlyIf)
			.hash(value, options);

		// build metadata
		const md5Hash = crypto.createHash("md5").update(value).digest("hex");
		const metadata: R2ObjectMetadata = {
			key,
			size: value.byteLength,
			etag: md5Hash,
			version: createVersion(),
			httpEtag: `"${md5Hash}"`,
			uploaded: Date.now(),
			httpMetadata: options.httpMetadata ?? {},
			customMetadata: options.customMetadata ?? {},
			checksums,
		};

		// Store value with expiration and metadata
		await this.storage.put<R2ObjectMetadata>(key, { value, metadata });
		return new R2Object(metadata);
	}

	async delete(keys: string | string[]) {
		if (Array.isArray(keys)) {
			for (const key of keys) validate.key(key);
			await this.storage.deleteMany(keys);
		} else {
			validate.key(keys);
			await this.storage.delete(keys);
		}
	}

	async list(listOptions: R2ListOptions = {}): Promise<R2Objects> {
		validate.limit(listOptions.limit);

		const { prefix = "", include = [], cursor = "", startAfter } = listOptions;
		let { delimiter, limit = MAX_LIST_KEYS } = listOptions;
		if (delimiter === "") delimiter = undefined;

		// If include contains inputs, we reduce the limit to max 100
		if (include.length > 0) limit = Math.min(limit, 100);

		// If startAfter is set, we should increment the limit here, as `startAfter`
		// is exclusive, but we're using inclusive `start` to implement it.
		// Ideally we want to return `limit` number of keys here. However, doing
		// this would be incompatible with the returned opaque `cursor`. Luckily,
		// the R2 list contract allows us to return less than `limit` keys, as
		// long as we set `truncated: true`. We'll fix this behaviour when we switch
		// to the new storage system.
		const res = await this.storage.list<R2ObjectMetadata>({
			prefix,
			limit,
			cursor,
			delimiter,
			start: startAfter,
		});
		const delimitedPrefixes = new Set(res.delimitedPrefixes ?? []);

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

		if (startAfter !== undefined && objects[0]?.key === startAfter) {
			// If the first key matched `startAfter`, remove it as this is exclusive
			objects.splice(0, 1);
		}

		const cursorLength = res.cursor.length > 0;
		return {
			objects,
			truncated: cursorLength,
			cursor: cursorLength ? res.cursor : undefined,
			delimitedPrefixes: [...delimitedPrefixes],
		};
	}
}
