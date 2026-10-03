const SERIALIZED_DATE = "___serialized_date___";
const SERIALIZED_BIGINT = "___serialized_bigint___";

// A payload key that looks like one of the tags (optionally already escaped
// with leading "~") gets one more "~" on the way out and loses one on the way
// back, so a tag key that reaches the reviver unescaped is always one we wrote.
const RESERVED_KEY = /^~*___serialized_(?:date|bigint)___$/;
const ESCAPED_KEY = /^~+___serialized_(?:date|bigint)___$/;

/**
 * JSON replacer that serializes `Date` and `bigint` values into tagged
 * objects so they survive a JSON round-trip in tail event forwarding.
 */
export function tailEventsReplacer(
	this: unknown,
	key: string,
	value: unknown
): unknown {
	// `JSON.stringify()` calls `Date.prototype.toJSON()` before handing a value
	// to the replacer, so a real `Date` arrives here already flattened to an ISO
	// string. Read the untouched value back off the holder to catch those.
	if (typeof value === "string") {
		const original = (this as Record<string, unknown>)[key];
		return original instanceof Date
			? { [SERIALIZED_DATE]: original.toISOString() }
			: value;
	}
	// Values a custom `toJSON()` returns reach the replacer unconverted.
	if (value instanceof Date) {
		return { [SERIALIZED_DATE]: value.toISOString() };
	}
	if (typeof value === "bigint") {
		return { [SERIALIZED_BIGINT]: value.toString() };
	}
	if (!isPlainRecord(value)) {
		return value;
	}
	if (!Object.keys(value).some((k) => RESERVED_KEY.test(k))) {
		return value;
	}
	const escaped: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) {
		escaped[RESERVED_KEY.test(k) ? `~${k}` : k] = v;
	}
	return escaped;
}

/**
 * JSON reviver that restores `Date` and `bigint` values from the tagged
 * objects produced by {@link tailEventsReplacer}.
 */
export function tailEventsReviver(_key: string, value: unknown): unknown {
	if (!isPlainRecord(value)) {
		return value;
	}
	const keys = Object.keys(value);
	if (keys.length === 1) {
		const tagged = value[keys[0]];
		if (keys[0] === SERIALIZED_DATE && typeof tagged === "string") {
			return new Date(tagged);
		}
		if (keys[0] === SERIALIZED_BIGINT && typeof tagged === "string") {
			// An older dev session doesn't escape payload keys, so a malformed tag can
			// still arrive from one. Leave it as the plain object it is.
			try {
				return BigInt(tagged);
			} catch {
				return value;
			}
		}
	}
	if (!keys.some((k) => ESCAPED_KEY.test(k))) {
		return value;
	}
	const unescaped: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) {
		unescaped[ESCAPED_KEY.test(k) ? k.slice(1) : k] = v;
	}
	return unescaped;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
