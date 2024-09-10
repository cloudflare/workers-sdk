import {
	CONTENT_HASH_SIZE,
	ENTRY_SIZE,
	HEADER_SIZE,
	PATH_HASH_SIZE,
} from "../../utils/utils";

export class AssetsManifest {
	private data: ArrayBuffer;

	constructor(data: ArrayBuffer) {
		this.data = data;
	}

	async get(pathname: string) {
		const pathHash = await hashPath(pathname);
		const entry = interpolationSearch(
			new Uint8Array(this.data, HEADER_SIZE),
			pathHash
		);
		return entry ? contentHashToKey(entry) : null;
	}
}

const interpolationSearch = (
	arr: Uint8Array,
	searchValue: Uint8Array
): Uint8Array | false => {
	// use the fact that the search space is sorted and uniformly distributed and that the search value is random to do a biased search
	// like humans do when looking through a phonebook

	// Find indexes of two corners
	let low = 0;
	let high = arr.byteLength / ENTRY_SIZE - 1;

	// Since array is sorted, an element present
	// in array must be in range defined by corner
	while (
		low <= high &&
		compare(searchValue, arr[low]) >= 0 &&
		compare(searchValue, arr[high]) <= 0
	) {
		if (low == high) {
			if (compare(arr[low], searchValue) === 0) {
				return low;
			}
			return -1;
		}

		// Probing the position with keeping
		// uniform distribution in mind.
		let pos = Math.floor(
			low + ((high - low) / (arr[high] - arr[low])) * (searchValue - arr[low])
		);

		// Condition of target found
		if (compare(arr[pos], searchValue) === 0) {
			return pos;
		}

		// If searchValue is larger, searchValue is in upper part
		if (arr[pos] < searchValue) {
			low = pos + 1;
		}

		// If searchValue is smaller, searchValue is in lower part
		else {
			high = pos - 1;
		}
	}

	return -1;
};

const binarySearch = (
	arr: Uint8Array,
	searchValue: Uint8Array
): Uint8Array | false => {
	if (arr.byteLength === 0) {
		return false;
	}
	const offset =
		arr.byteOffset + ((arr.byteLength / ENTRY_SIZE) >> 1) * ENTRY_SIZE;
	const current = new Uint8Array(arr.buffer, offset, PATH_HASH_SIZE);
	if (current.byteLength !== searchValue.byteLength) {
		throw new TypeError(
			"Search value and current value are of different lengths"
		);
	}
	const cmp = compare(searchValue, current);
	if (cmp < 0) {
		const nextOffset = arr.byteOffset;
		const nextLength = offset - arr.byteOffset;
		return binarySearch(
			new Uint8Array(arr.buffer, nextOffset, nextLength),
			searchValue
		);
	} else if (cmp > 0) {
		const nextOffset = offset + ENTRY_SIZE;
		const nextLength = arr.buffer.byteLength - offset - ENTRY_SIZE;
		return binarySearch(
			new Uint8Array(arr.buffer, nextOffset, nextLength),
			searchValue
		);
	} else {
		return new Uint8Array(arr.buffer, offset, ENTRY_SIZE);
	}
};

const compare = (a: Uint8Array, b: Uint8Array) => {
	if (a.byteLength < b.byteLength) {
		return -1;
	}
	if (a.byteLength > b.byteLength) {
		return 1;
	}

	for (const [i, v] of a.entries()) {
		if (v < b[i]) {
			return -1;
		}
		if (v > b[i]) {
			return 1;
		}
	}

	return 0;
};

const contentHashToKey = (buffer: Uint8Array) => {
	const contentHash = buffer.slice(
		PATH_HASH_SIZE,
		PATH_HASH_SIZE + CONTENT_HASH_SIZE
	);
	return [...contentHash].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hashPath = async (path: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(path);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer);
	return new Uint8Array(hashBuffer, 0, PATH_HASH_SIZE);
};
