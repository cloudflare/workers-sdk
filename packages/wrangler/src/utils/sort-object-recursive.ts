/**
 * Removes from the object every undefined property
 */
export function stripUndefined<T = Record<string, unknown>>(r: T): T {
	for (const k in r) {
		if (r[k] === undefined) {
			delete r[k];
		}
	}

	return r;
}

/**
 * Take an object and sort its keys in alphabetical order.
 */
function sortObjectKeys(unordered: Record<string | number, unknown>) {
	if (Array.isArray(unordered)) {
		return unordered;
	}

	return Object.keys(unordered)
		.sort()
		.reduce(
			(obj, key) => {
				obj[key] = unordered[key];
				return obj;
			},
			{} as Record<string, unknown>
		);
}

/**
 * Take an object and sort its keys in alphabetical order recursively.
 * Useful to normalize objects so they can be compared when rendered.
 * It will copy the object and not mutate it.
 */
export function sortObjectRecursive<T = Record<string | number, unknown>>(
	object: Record<string | number, unknown> | Record<string | number, unknown>[]
): T {
	if (typeof object !== "object") {
		return object;
	}

	if (Array.isArray(object)) {
		return object.map((obj) => sortObjectRecursive(obj)) as T;
	}

	const objectCopy: Record<string | number, unknown> = { ...object };
	for (const [key, value] of Object.entries(object)) {
		if (typeof value === "object") {
			if (value === null) {
				continue;
			}
			objectCopy[key] = sortObjectRecursive(
				value as Record<string, unknown>
			) as unknown;
		}
	}

	return sortObjectKeys(objectCopy) as T;
}
