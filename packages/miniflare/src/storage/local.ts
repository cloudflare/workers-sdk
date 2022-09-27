import { Awaitable, defaultClock, millisToSeconds } from "../shared";
import {
	Range,
	RangeStoredValueMeta,
	Storage,
	StorageListOptions,
	StorageListResult,
	StoredKeyMeta,
	StoredMeta,
	StoredValueMeta,
	listFilterMatch,
	listPaginate,
} from "./storage";

export abstract class LocalStorage extends Storage {
	protected constructor(private readonly clock = defaultClock) {
		super();
	}

	abstract hasMaybeExpired(key: string): Awaitable<StoredMeta | undefined>;
	abstract headMaybeExpired<Meta>(
		key: string
	): Awaitable<StoredMeta<Meta> | undefined>;
	abstract getMaybeExpired<Meta>(
		key: string
	): Awaitable<StoredValueMeta<Meta> | undefined>;
	abstract getRangeMaybeExpired<Meta>(
		key: string,
		range: Range
	): Awaitable<RangeStoredValueMeta<Meta> | undefined>;
	abstract deleteMaybeExpired(key: string): Awaitable<boolean>;
	abstract listAllMaybeExpired<Meta>(): Awaitable<StoredKeyMeta<Meta>[]>;

	private expired({ expiration }: StoredMeta, time = this.clock()): boolean {
		return expiration !== undefined && expiration <= millisToSeconds(time);
	}

	async has(key: string): Promise<boolean> {
		const stored = await this.hasMaybeExpired(key);
		if (stored === undefined) return false;
		if (this.expired(stored)) {
			await this.deleteMaybeExpired(key);
			return false;
		}
		return true;
	}

	async head<Meta = unknown>(
		key: string
	): Promise<StoredMeta<Meta> | undefined> {
		const stored = await this.headMaybeExpired<Meta>(key);
		if (stored === undefined) return undefined;
		if (this.expired(stored)) {
			await this.deleteMaybeExpired(key);
			return undefined;
		}
		return stored;
	}

	async get<Meta = unknown>(
		key: string
	): Promise<StoredValueMeta<Meta> | undefined> {
		const stored = await this.getMaybeExpired<Meta>(key);
		if (stored === undefined) return undefined;
		if (this.expired(stored)) {
			await this.deleteMaybeExpired(key);
			return undefined;
		}
		return stored;
	}

	async getRange<Meta = unknown>(
		key: string,
		range: Range = {}
	): Promise<RangeStoredValueMeta<Meta> | undefined> {
		const stored = await this.getRangeMaybeExpired<Meta>(key, range);
		if (stored === undefined) return undefined;
		if (this.expired(stored)) {
			await this.deleteMaybeExpired(key);
			return undefined;
		}
		return stored;
	}

	async delete(key: string): Promise<boolean> {
		const stored = await this.hasMaybeExpired(key);
		const expired = stored !== undefined && this.expired(stored);
		const deleted = await this.deleteMaybeExpired(key);
		// TOCTTOU: not using `stored` to determine if file existed in first place,
		// just whether it had expired before deleting
		if (!deleted) return false;
		return !expired;
	}

	async list<Meta = unknown>(
		options?: StorageListOptions
	): Promise<StorageListResult<StoredKeyMeta<Meta>>> {
		const time = this.clock();
		const deletePromises: Awaitable<boolean>[] = [];

		// Fetch all keys
		let keys = await this.listAllMaybeExpired<Meta>();
		// Filter out expired and non-matching keys
		keys = keys.filter((stored) => {
			if (this.expired(stored, time)) {
				deletePromises.push(this.deleteMaybeExpired(stored.name));
				return false;
			}
			// Apply prefix, start, and end filter
			return listFilterMatch(options, stored.name);
		});

		// Apply sort, cursor, limit, and delimiter
		const res = listPaginate(options, keys);
		await Promise.all(deletePromises);
		return res;
	}
}
