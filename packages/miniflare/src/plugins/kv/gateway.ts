import { Clock, HttpError, Log, millisToSeconds } from "../../shared";
import { Storage, StoredKeyMeta, StoredValueMeta } from "../../storage";
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

export interface KVGatewayGetOptions {
	cacheTtl?: number;
}

export interface KVGatewayPutOptions<Meta = unknown> {
	expiration?: string | number;
	expirationTtl?: string | number;
	metadata?: Meta;
}

export interface KVGatewayListOptions {
	limit?: number;
	prefix?: string;
	cursor?: string;
}
export interface KVGatewayListResult<Meta = unknown> {
	keys: StoredKeyMeta<Meta>[];
	cursor?: string;
	list_complete: boolean;
}

export class KVGateway {
	constructor(
		private readonly log: Log,
		private readonly storage: Storage,
		private readonly clock: Clock
	) {}

	async get(
		key: string,
		options?: KVGatewayGetOptions
	): Promise<StoredValueMeta | undefined> {
		validateKey(key);
		// Validate cacheTtl, but ignore it as there's only one "edge location":
		// the user's computer
		const cacheTtl = options?.cacheTtl;
		if (
			cacheTtl !== undefined &&
			(isNaN(cacheTtl) || cacheTtl < MIN_CACHE_TTL)
		) {
			throw new KVError(
				400,
				`Invalid ${PARAM_CACHE_TTL} of ${cacheTtl}. Cache TTL must be at least ${MIN_CACHE_TTL}.`
			);
		}
		return this.storage.get(key, false, cacheTtl);
	}

	async put(
		key: string,
		value: Uint8Array,
		options: KVGatewayPutOptions = {}
	): Promise<void> {
		validateKey(key);

		// Normalise and validate expiration
		const now = millisToSeconds(this.clock());
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

		// Validate value and metadata size
		if (value.byteLength > MAX_VALUE_SIZE) {
			throw new KVError(
				413,
				`Value length of ${value.byteLength} exceeds limit of ${MAX_VALUE_SIZE}.`
			);
		}
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

		return this.storage.put(key, {
			value,
			expiration,
			metadata: options.metadata,
		});
	}

	async delete(key: string): Promise<void> {
		validateKey(key);
		await this.storage.delete(key);
	}

	async list(options: KVGatewayListOptions = {}): Promise<KVGatewayListResult> {
		// Validate key limit
		const limit = options.limit ?? MAX_LIST_KEYS;
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

		// Validate key prefix
		const prefix = options.prefix;
		if (prefix !== undefined) validateKeyLength(prefix);

		const cursor = options.cursor;
		const res = await this.storage.list({ limit, prefix, cursor });
		return {
			keys: res.keys.map((key) => ({
				...key,
				// workerd expects metadata to be a JSON-serialised string
				metadata:
					key.metadata === undefined ? undefined : JSON.stringify(key.metadata),
			})),
			cursor: res.cursor === "" ? undefined : res.cursor,
			list_complete: res.cursor === "",
		};
	}
}
