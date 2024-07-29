export function* createBatches<T>(
	array: T[],
	size: number
): IterableIterator<T[]> {
	for (let i = 0; i < array.length; i += size) {
		yield array.slice(i, i + size);
	}
}
