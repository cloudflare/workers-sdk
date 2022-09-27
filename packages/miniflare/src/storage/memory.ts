import { defaultClock } from "../shared";
import { LocalStorage } from "./local";
import {
	Range,
	RangeStoredValueMeta,
	StoredKeyMeta,
	StoredMeta,
	StoredValueMeta,
	cloneMetadata,
} from "./storage";

export class MemoryStorage extends LocalStorage {
	constructor(
		protected map = new Map<string, StoredValueMeta>(),
		clock = defaultClock
	) {
		super(clock);
	}

	hasMaybeExpired(key: string): StoredMeta | undefined {
		const stored = this.map.get(key);
		// Return fresh copy so caller can mutate without affecting stored
		return (
			stored && {
				expiration: stored.expiration,
				metadata: cloneMetadata(stored.metadata),
			}
		);
	}

	headMaybeExpired<Meta>(key: string): StoredMeta<Meta> | undefined {
		const stored = this.map.get(key);
		return (
			stored && {
				expiration: stored.expiration,
				metadata: cloneMetadata(stored.metadata),
			}
		);
	}

	getMaybeExpired<Meta>(key: string): StoredValueMeta<Meta> | undefined {
		const stored = this.map.get(key);
		// Return fresh copy so caller can mutate without affecting stored
		return (
			stored && {
				value: stored.value.slice(),
				expiration: stored.expiration,
				metadata: cloneMetadata(stored.metadata),
			}
		);
	}

	getRangeMaybeExpired<Meta>(
		key: string,
		{ offset, length, suffix }: Range
	): RangeStoredValueMeta<Meta> | undefined {
		const stored = this.map.get(key);
		if (stored === undefined) return;
		const { value } = stored;
		const size = value.byteLength;
		// build proper offset and length
		if (suffix !== undefined) {
			if (suffix <= 0) {
				throw new Error("Suffix must be > 0");
			}
			if (suffix > size) suffix = size;
			offset = size - suffix;
			length = size - offset;
		}
		if (offset === undefined) offset = 0;
		if (length === undefined) length = size - offset;

		// if offset is negative or greater than size, throw an error
		if (offset < 0) throw new Error("Offset must be >= 0");
		if (offset > size) throw new Error("Offset must be < size");
		// if length is less than or equal to 0, throw an error
		if (length <= 0) throw new Error("Length must be > 0");

		// if length goes beyond actual length, adjust length to the end of the value
		if (offset + length > size) length = size - offset;

		return {
			value: value.slice(offset, offset + length),
			expiration: stored.expiration,
			metadata: cloneMetadata(stored.metadata),
			range: {
				offset,
				length,
			},
		};
	}

	put<Meta = unknown>(key: string, value: StoredValueMeta<Meta>): void {
		// Store fresh copy so further mutations from caller aren't stored
		this.map.set(key, {
			value: value.value.slice(),
			expiration: value.expiration,
			metadata: cloneMetadata(value.metadata),
		});
	}

	deleteMaybeExpired(key: string): boolean {
		return this.map.delete(key);
	}

	private static entryToStoredKey([name, { expiration, metadata }]: [
		string,
		StoredValueMeta,
	]): StoredKeyMeta {
		// Return fresh copy so caller can mutate without affecting stored
		return {
			name,
			expiration,
			metadata: cloneMetadata(metadata),
		};
	}

	listAllMaybeExpired<Meta>(): StoredKeyMeta<Meta>[] {
		return Array.from(this.map.entries()).map(
			MemoryStorage.entryToStoredKey
		) as StoredKeyMeta<Meta>[];
	}
}
