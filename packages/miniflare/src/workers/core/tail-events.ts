const SERIALIZED_DATE = "___serialized_date___";
const SERIALIZED_BIGINT = "___serialized_bigint___";

/**
 * JSON replacer that serializes `Date` and `bigint` values into tagged
 * objects so they survive a JSON round-trip in tail event forwarding.
 */
export function tailEventsReplacer(this: any, key: string, value: any) {
	// `JSON.stringify()` calls `Date.prototype.toJSON()` before handing a value
	// to the replacer, so a real `Date` arrives here already flattened to an ISO
	// string. Read the untouched value back off the holder to catch those. The
	// `instanceof` check below still matters for values a custom `toJSON()`
	// returns, which reach the replacer unconverted.
	if (typeof value === "string") {
		const original = this[key];
		if (original instanceof Date) {
			return { [SERIALIZED_DATE]: original.toISOString() };
		}
	}
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	} else if (typeof value === "bigint") {
		return { [SERIALIZED_BIGINT]: value.toString() };
	}
	return value;
}

/**
 * JSON reviver that restores `Date` and `bigint` values from the tagged
 * objects produced by {@link tailEventsReplacer}.
 */
export function tailEventsReviver(_: string, value: any) {
	if (value && typeof value === "object") {
		if (SERIALIZED_DATE in value) {
			return new Date(value[SERIALIZED_DATE]);
		} else if (SERIALIZED_BIGINT in value) {
			try {
				return BigInt(value[SERIALIZED_BIGINT]);
			} catch {
				// `BigInt()` throws on a string that isn't an integer, unlike
				// `new Date()`. A payload that merely happens to carry the tag would
				// otherwise fail the parse it is meant to survive, so leave it as the
				// plain object it already is.
				return value;
			}
		}
	}
	return value;
}
