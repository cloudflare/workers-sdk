const serializedDate = "___serialized_date___";

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
	return value;
}

export function tailEventsReviver(_: string, value: unknown) {
	// To restore Date objects from the serialized events
	if (
		value &&
		typeof value === "object" &&
		serializedDate in value &&
		typeof value[serializedDate] === "string"
	) {
		return new Date(value[serializedDate]);
	}

	return value;
}
