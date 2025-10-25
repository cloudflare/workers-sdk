export function caseInsensitiveEnv(): Record<string, string> {
	const tracked = new Map<string | symbol, string | symbol>();
	const targetObj = {} as Record<string, string>;

	const canonical = (property: string | symbol) =>
		typeof property === "string" ? property.toLowerCase() : property;

	return new Proxy(targetObj, {
		get(target, property, receiver) {
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.get(target, actualProperty, receiver)
				: undefined;
		},
		set(target, property, value, receiver) {
			tracked.set(canonical(property), property);
			return Reflect.set(target, property, value, receiver);
		},
		has(target, property) {
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.has(target, actualProperty)
				: false;
		},
		getOwnPropertyDescriptor(target, property) {
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.getOwnPropertyDescriptor(target, actualProperty)
				: undefined;
		},
		defineProperty(target, property, descriptor) {
			tracked.set(canonical(property), property);
			return Reflect.defineProperty(target, property, descriptor);
		},
		deleteProperty(target, property) {
			tracked.delete(canonical(property));
			return Reflect.deleteProperty(target, property);
		},
	});
}
