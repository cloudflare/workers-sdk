/**
 * Returns a shallow copy of an object with properties whose values are `null`
 * or `undefined` removed.
 */
export function omitNullish<T extends Record<string, unknown>>(object: T): T {
	return Object.fromEntries(
		Object.entries(object).filter(
			([, value]) => value !== null && value !== undefined
		)
	) as T;
}
