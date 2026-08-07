import type { V4SourceOptions, V4WorkerOptionsShape } from "./config/v4-schema";

export type KnownKeys<T> = {
	[K in keyof T as string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K]: T[K];
};
export type LegacyWorkerOptions = KnownKeys<V4WorkerOptionsShape> &
	V4SourceOptions;

// https://github.com/Rich-Harris/devalue/blob/50af63e2b2c648f6e6ea29904a14faac25a581fc/src/utils.js#L31-L51
const objectProtoNames = Object.getOwnPropertyNames(Object.prototype)
	.sort()
	.join("\0");
function isPlainObject(value: unknown): value is Record<string, unknown> {
	const proto = Object.getPrototypeOf(value);
	return (
		proto === Object.prototype ||
		proto === null ||
		Object.getOwnPropertyNames(proto).sort().join("\0") === objectProtoNames
	);
}

// Get all the keys in `WorkerOptions` whose values can be either an array or
// a record (e.g. `kvNamespaces` which can either be a `string[]` of namespaces
// or a `Record<string, string>` mapping binding name to namespace ID)
type ArrayRecordKeys<O extends object, K extends keyof O> = K extends unknown
	? Extract<O[K], unknown[]> extends never
		? never
		: Extract<O[K], Record<string, unknown>> extends never
			? never
			: K
	: never;
// "kvNamespaces" | "r2Buckets" | "queueProducers" | "queueConsumers" | ...
type WorkerOptionsArrayRecordKeys = Exclude<
	ArrayRecordKeys<LegacyWorkerOptions, keyof LegacyWorkerOptions>,
	"unsafeBindings"
>;
// Get the record type that can be used for key `K` in `WorkerOptions`
type WorkerOptionsRecord<K extends WorkerOptionsArrayRecordKeys> = Extract<
	LegacyWorkerOptions[K],
	Record<string, unknown>
>;
/** Converts the array-form of key `K` in `WorkerOptions` to its object form */
function convertWorkerOptionsArrayToObject<
	K extends WorkerOptionsArrayRecordKeys,
>(
	key: K,
	array: Extract<LegacyWorkerOptions[K], unknown[]>
): WorkerOptionsRecord<K> {
	const _: string[] = array; // Static assert that `array` is a `string[]`
	if (key === "queueConsumers") {
		// Unfortunately, we can't just `return Object.fromEntries(...)` here, as
		// TypeScript isn't smart enough to substitute "queueConsumers" as `K` in
		// the return type. We'd still like to verify correct types, so try assign
		// it to that first, then return by casting.
		const object: WorkerOptionsRecord<"queueConsumers"> = Object.fromEntries(
			array.map((item) => [item, {}])
		);
		return object as WorkerOptionsRecord<K>;
	} else {
		const object: WorkerOptionsRecord<
			// `Exclude` encodes the `else` here
			Exclude<WorkerOptionsArrayRecordKeys, "queueConsumers">
		> = Object.fromEntries(array.map((item) => [item, item]));
		return object as WorkerOptionsRecord<K>;
	}
}

/**
 * Merges all of `b`'s properties into `a`. Only merges 1 level deep, i.e.
 * `kvNamespaces` will be fully-merged, but `durableObject` object-designators
 * will be overwritten.
 */
export function mergeWorkerOptions(
	/* mut */ a: Partial<LegacyWorkerOptions>,
	b: Partial<LegacyWorkerOptions>
): Partial<LegacyWorkerOptions> {
	const aRecord = a as Record<string, unknown>;
	for (const [key, bValue] of Object.entries(b)) {
		const aValue = aRecord[key];
		if (aValue === undefined) {
			// Simple case: if `key` only exists in `b`, copy it over to `a`
			aRecord[key] = bValue;
			continue;
		}

		const aIsArray = Array.isArray(aValue);
		const bIsArray = Array.isArray(bValue);
		const aIsObject = isPlainObject(aValue);
		const bIsObject = isPlainObject(bValue);
		if (aIsArray && bIsArray) {
			// Merge arrays by joining them together, de-duplicating primitives
			aRecord[key] = Array.from(new Set(aValue.concat(bValue)));
		} else if (aIsArray && bIsObject) {
			// Merge arrays and objects by converting the array into object form,
			// then assigning `b` to `a`.
			const aNewValue = convertWorkerOptionsArrayToObject(
				// Must be an array/record key if `aValue` & `bValue` are array/record
				key as WorkerOptionsArrayRecordKeys,
				aValue
			);
			Object.assign(aNewValue, bValue);
			aRecord[key] = aNewValue;
		} else if (aIsObject && bIsArray) {
			const bNewValue = convertWorkerOptionsArrayToObject(
				// Must be an array/record key if `aValue` & `bValue` are array/record
				key as WorkerOptionsArrayRecordKeys,
				bValue
			);
			Object.assign(aValue, bNewValue);
		} else if (aIsObject && bIsObject) {
			// Merge objects by assigning `b` to `a`
			Object.assign(aValue, bValue);
		} else {
			// Merge primitives/complex objects by just using `b`'s value
			aRecord[key] = bValue;
		}
	}
	return a;
}
