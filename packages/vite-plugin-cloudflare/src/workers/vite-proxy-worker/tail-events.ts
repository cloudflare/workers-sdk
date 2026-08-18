const serializedDate = "___serialized_date___";
const serializedBigint = "___serialized_bigint___";

export function tailEventsReplacer(this: unknown, key: string, value: unknown) {
	// The tail events might contain Date objects which will not be restored directly.
	// `JSON.stringify()` calls `Date.prototype.toJSON()` before handing a value to
	// the replacer, so a real `Date` arrives here already flattened to an ISO
	// string. Read the untouched value back off the holder to catch those. The
	// `instanceof` check below still matters for values a custom `toJSON()`
	// returns, which reach the replacer unconverted.
	if (typeof value === "string") {
		const original = (this as Record<string, unknown>)[key];
		if (original instanceof Date) {
			return { [serializedDate]: original.toISOString() };
		}
	}
	if (value instanceof Date) {
		return { [serializedDate]: value.toISOString() };
	}
	// A bigint makes `JSON.stringify()` throw rather than dropping the value, so
	// leaving it untagged takes out the whole forwarding call.
	if (typeof value === "bigint") {
		return { [serializedBigint]: value.toString() };
	}
	return value;
}

export function tailEventsReviver(_: string, value: unknown) {
	// To restore Date and bigint values from the serialized events
	if (value && typeof value === "object") {
		if (serializedDate in value && typeof value[serializedDate] === "string") {
			return new Date(value[serializedDate]);
		}
		if (
			serializedBigint in value &&
			typeof value[serializedBigint] === "string"
		) {
			try {
				return BigInt(value[serializedBigint]);
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
