import { ReadableStream, TransformStream } from "stream/web";
import {
	HttpError,
	Log,
	Timers,
	maybeApply,
	millisToSeconds,
	secondsToMillis,
} from "../../shared";
import { KeyValueStorage, Storage } from "../../storage";
import {
	MAX_KEY_SIZE,
	MAX_LIST_KEYS,
	MAX_METADATA_SIZE,
	MAX_VALUE_SIZE,
	MIN_CACHE_TTL,
	PARAM_CACHE_TTL,
	PARAM_EXPIRATION,
	PARAM_EXPIRATION_TTL,
	PARAM_LIST_LIMIT,
} from "./constants";

export class KVError extends HttpError {}

function validateKey(key: string): void {
	if (key === "") {
		throw new KVError(400, "Key names must not be empty");
	}
	if (key === "." || key === "..") {
		throw new KVError(
			400,
			`Illegal key name "${key}". Please use a different name.`
		);
	}
	validateKeyLength(key);
}

function validateKeyLength(key: string): void {
	const keyLength = Buffer.byteLength(key);
	if (keyLength > MAX_KEY_SIZE) {
		throw new KVError(
			414,
			`UTF-8 encoded length of ${keyLength} exceeds key length limit of ${MAX_KEY_SIZE}.`
		);
	}
}

// Returns value as an integer or undefined if it isn't one
function normaliseInt(value: string | number | undefined): number | undefined {
	switch (typeof value) {
		case "string":
			return parseInt(value);
		case "number":
			return Math.round(value);
	}
}

function createMaxValueSizeError(length: number) {
	return new KVError(
		413,
		`Value length of ${length} exceeds limit of ${MAX_VALUE_SIZE}.`
	);
}
class MaxLengthStream extends TransformStream<Uint8Array, Uint8Array> {
	constructor(maxLength: number, errorFactory: (length: number) => Error) {
		let length = 0;
		super({
			transform(chunk, controller) {
				length += chunk.byteLength;
				// If we exceeded the maximum length, don't enqueue the chunk as we'll
				// be aborting the stream, but don't error just yet, so we get the
				// correct final length in the error
				if (length <= maxLength) controller.enqueue(chunk);
			},
			flush(controller) {
				// If we exceeded the maximum length, abort the stream
				if (length > maxLength) controller.error(errorFactory(length));
			},
		});
	}
}

export interface KVGatewayGetOptions {
	cacheTtl?: number;
}
export interface KVGatewayGetResult<Metadata = unknown> {
	value: ReadableStream<Uint8Array>;
	expiration?: number; // seconds since unix epoch
	metadata?: Metadata;
}

export interface KVGatewayPutOptions<Metadata = unknown> {
	expiration?: string | number; // seconds since unix epoch
	expirationTtl?: string | number; // seconds relative to now
	metadata?: Metadata;
	valueLengthHint?: number;
}

export interface KVGatewayListOptions {
	limit?: number;
	prefix?: string;
	cursor?: string;
}
export interface KVGatewayListKey {
	name: string;
	expiration?: number; // seconds since unix epoch
	metadata?: string; // JSON-stringified metadata
}
export type KVGatewayListResult = {
	keys: KVGatewayListKey[];
} & (
	| { list_complete: false; cursor: string }
	| { list_complete: true; cursor: undefined }
);

export function validateGetOptions(
	key: string,
	options?: KVGatewayGetOptions
): void {
	validateKey(key);
	// Validate cacheTtl, but ignore it as there's only one "edge location":
	// the user's computer
	const cacheTtl = options?.cacheTtl;
	if (cacheTtl !== undefined && (isNaN(cacheTtl) || cacheTtl < MIN_CACHE_TTL)) {
		throw new KVError(
			400,
			`Invalid ${PARAM_CACHE_TTL} of ${cacheTtl}. Cache TTL must be at least ${MIN_CACHE_TTL}.`
		);
	}
}

export function validateListOptions(options: KVGatewayListOptions): void {
	// Validate key limit
	const limit = options.limit;
	if (limit !== undefined) {
		if (isNaN(limit) || limit < 1) {
			throw new KVError(
				400,
				`Invalid ${PARAM_LIST_LIMIT} of ${limit}. Please specify an integer greater than 0.`
			);
		}
		if (limit > MAX_LIST_KEYS) {
			throw new KVError(
				400,
				`Invalid ${PARAM_LIST_LIMIT} of ${limit}. Please specify an integer less than ${MAX_LIST_KEYS}.`
			);
		}
	}

	// Validate key prefix
	const prefix = options.prefix;
	if (prefix !== undefined) validateKeyLength(prefix);
}

export class KVGateway {
	private readonly storage: KeyValueStorage;

	constructor(
		private readonly log: Log,
		storage: Storage,
		private readonly timers: Timers
	) {
		this.storage = new KeyValueStorage(storage, timers);
	}

	async get<Metadata = unknown>(
		key: string,
		options?: KVGatewayGetOptions
	): Promise<KVGatewayGetResult<Metadata> | undefined> {
		validateGetOptions(key, options);
		const entry = await this.storage.get(key);
		if (entry === null) return;
		return {
			value: entry.value,
			expiration: maybeApply(millisToSeconds, entry.expiration),
			metadata: entry.metadata as Metadata,
		};
	}

	async put(
		key: string,
		value: ReadableStream<Uint8Array>,
		options: KVGatewayPutOptions = {}
	): Promise<void> {
		validateKey(key);

		// Normalise and validate expiration
		const now = millisToSeconds(this.timers.now());
		let expiration = normaliseInt(options.expiration);
		const expirationTtl = normaliseInt(options.expirationTtl);
		if (expirationTtl !== undefined) {
			if (isNaN(expirationTtl) || expirationTtl <= 0) {
				throw new KVError(
					400,
					`Invalid ${PARAM_EXPIRATION_TTL} of ${options.expirationTtl}. Please specify integer greater than 0.`
				);
			}
			if (expirationTtl < MIN_CACHE_TTL) {
				throw new KVError(
					400,
					`Invalid ${PARAM_EXPIRATION_TTL} of ${options.expirationTtl}. Expiration TTL must be at least ${MIN_CACHE_TTL}.`
				);
			}
			expiration = now + expirationTtl;
		} else if (expiration !== undefined) {
			if (isNaN(expiration) || expiration <= now) {
				throw new KVError(
					400,
					`Invalid ${PARAM_EXPIRATION} of ${options.expiration}. Please specify integer greater than the current number of seconds since the UNIX epoch.`
				);
			}
			if (expiration < now + MIN_CACHE_TTL) {
				throw new KVError(
					400,
					`Invalid ${PARAM_EXPIRATION} of ${options.expiration}. Expiration times must be at least ${MIN_CACHE_TTL} seconds in the future.`
				);
			}
		}

		// Validate metadata size
		if (options.metadata !== undefined) {
			const metadataJSON = JSON.stringify(options.metadata);
			const metadataLength = Buffer.byteLength(metadataJSON);
			if (metadataLength > MAX_METADATA_SIZE) {
				throw new KVError(
					413,
					`Metadata length of ${metadataLength} exceeds limit of ${MAX_METADATA_SIZE}.`
				);
			}
		}

		// Validate value size
		const valueLengthHint = options.valueLengthHint;
		if (valueLengthHint !== undefined && valueLengthHint > MAX_VALUE_SIZE) {
			// If we know the size of the value (i.e. from `Content-Length`) use that
			throw createMaxValueSizeError(valueLengthHint);
		} else {
			// Otherwise, pipe through a transform stream that counts the number of
			// bytes and errors if it exceeds the max. This error will be thrown
			// within the `storage.put()` call below and will be propagated up to the
			// caller.
			value = value.pipeThrough(
				new MaxLengthStream(MAX_VALUE_SIZE, createMaxValueSizeError)
			);
		}

		return this.storage.put({
			key,
			value,
			expiration: maybeApply(secondsToMillis, expiration),
			metadata: options.metadata,
		});
	}

	async delete(key: string): Promise<void> {
		validateKey(key);
		await this.storage.delete(key);
	}

	async list(options: KVGatewayListOptions = {}): Promise<KVGatewayListResult> {
		validateListOptions(options);
		const { limit = MAX_LIST_KEYS, prefix, cursor } = options;
		const res = await this.storage.list({ limit, prefix, cursor });
		const keys = res.keys.map<KVGatewayListKey>((key) => ({
			name: key.key,
			expiration: maybeApply(millisToSeconds, key.expiration),
			// workerd expects metadata to be a JSON-serialised string
			metadata: maybeApply(JSON.stringify, key.metadata),
		}));
		if (res.cursor === undefined) {
			return { keys, list_complete: true, cursor: undefined };
		} else {
			return { keys, list_complete: false, cursor: res.cursor };
		}
	}
}
