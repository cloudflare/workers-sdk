/**
 * Merge two arrays of objects, overriding elements in `source` with
 * elements from `override`, if they have the same `keyProperty` value
 */
export function mergeWithOverride<T>(
	source: Array<T>,
	override: Array<T>,
	keyProperty: keyof T
): Array<T> {
	const sourceMap: Map<T[typeof keyProperty], T> = new Map();

	source.forEach((el) => sourceMap.set(el[keyProperty], el));
	override.forEach((el) => sourceMap.set(el[keyProperty], el));

	return Array.from(sourceMap.values());
}
