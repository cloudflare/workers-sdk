export function unusable<T extends object>(): T {
	return new Proxy({} as T, {
		apply() {
			throw new TypeError("Attempted to call unusable object");
		},
		construct() {
			throw new TypeError("Attempted to construct unusable object");
		},
		deleteProperty(_target, prop) {
			throw new TypeError(
				`Attempted to delete "${String(prop)}" on unusable object`
			);
		},
		get(_target, prop) {
			throw new TypeError(
				`Attempted to get "${String(prop)}" on unusable object`
			);
		},
		has(_target, prop) {
			throw new TypeError(
				`Attempted to check for "${String(prop)}" on unusable object`
			);
		},
		set(_target, prop) {
			throw new TypeError(
				`Attempted to set "${String(prop)}" on unusable object`
			);
		},
	});
}
