import {
	CONTENT_HASH_SIZE,
	ENTRY_SIZE,
	HEADER_SIZE,
	PATH_HASH_SIZE,
} from "../../utils/constants";

export class AssetsManifest {
	private data: ArrayBuffer;

	constructor(data: ArrayBuffer) {
		this.data = data;
	}

	async getWithBinarySearch(pathname: string) {
		const pathHash = await hashPath(pathname);
		const entry = binarySearch(
			new Uint8Array(this.data, HEADER_SIZE),
			pathHash
		);
		return entry ? contentHashToKey(entry) : null;
	}

	async getWithInterpolationSearch(pathname: string) {
		const pathHash = await hashPath(pathname);
		const entry = interpolationSearch(
			new Uint8Array(this.data, HEADER_SIZE),
			pathHash
		);
		return entry ? contentHashToKey(entry) : null;
	}
}

export const hashPath = async (path: string) => {
	const encoder = new TextEncoder();
	const data = encoder.encode(path);
	const hashBuffer = await crypto.subtle.digest(
		"SHA-256",
		data.buffer as ArrayBuffer
	);
	return new Uint8Array(hashBuffer, 0, PATH_HASH_SIZE);
};

export const binarySearch = (
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

const uint8ArrayToNumber = (uint8Array: Uint8Array) => {
	const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset);
	return (dataView.getBigUint64(0) << 64n) + dataView.getBigUint64(8);
};

export const interpolationSearch = (
	arr: Uint8Array,
	searchValue: Uint8Array
) => {
	if (arr.byteLength === 0) {
		return false;
	}
	// top and tail the search space
	let low = 0;
	let high = arr.byteLength / ENTRY_SIZE - 1;
	const searchValueNumber = uint8ArrayToNumber(searchValue);
	while (low <= high) {
		if (low === high) {
			// search space has been reduced to a single element
			const current = new Uint8Array(
				arr.buffer,
				arr.byteOffset + low * ENTRY_SIZE,
				PATH_HASH_SIZE
			);
			if (current.byteLength !== searchValue.byteLength) {
				throw new TypeError(
					"Search value and current value are of different lengths"
				);
			}
			const cmp = compare(current, searchValue);
			if (cmp === 0) {
				// and it's a match!
				return new Uint8Array(
					arr.buffer,
					arr.byteOffset + low * ENTRY_SIZE,
					ENTRY_SIZE
				);
			} else {
				// and it's not a match!
				return false;
			}
		}
		const lowValue = new Uint8Array(
			arr.buffer,
			arr.byteOffset + low * ENTRY_SIZE,
			PATH_HASH_SIZE
		);
		const highValue = new Uint8Array(
			arr.buffer,
			arr.byteOffset + high * ENTRY_SIZE,
			PATH_HASH_SIZE
		);
		const lowValueNumber = uint8ArrayToNumber(lowValue);
		const highValueNumber = uint8ArrayToNumber(highValue);
		const denominator = highValueNumber - lowValueNumber;
		if (denominator <= 0n) {
			throw new TypeError("Search space is unordered");
		}
		const numerator = searchValueNumber - lowValueNumber;
		if (numerator < 0n) {
			// the lowest value in our search space is smaller than the search value (so it can't be in the search space)
			return false;
		}
		const mid = Math.floor(
			Number(BigInt(low) + (BigInt(high - low) * numerator) / denominator)
		);
		if (mid < low || mid > high) {
			// our next guess is either entirely out of range of the search space or we've already searched it
			return false;
		}
		const current = new Uint8Array(
			arr.buffer,
			arr.byteOffset + mid * ENTRY_SIZE,
			PATH_HASH_SIZE
		);
		if (current.byteLength !== searchValue.byteLength) {
			throw new TypeError(
				"Search value and current value are of different lengths"
			);
		}
		const cmp = compare(current, searchValue);
		if (cmp === 0) {
			return new Uint8Array(
				arr.buffer,
				arr.byteOffset + mid * ENTRY_SIZE,
				ENTRY_SIZE
			);
		} else if (cmp < 0) {
			// our estimate was too low so our search space now becomes mid+1 -> high
			low = mid + 1;
		} else {
			// our estimate was too high so our search space now becomes low -> mid-1
			high = mid - 1;
		}
	}
	return false;
};

export const compare = (a: Uint8Array, b: Uint8Array) => {
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
