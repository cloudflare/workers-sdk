import assert from "assert";

export function caseInsensitiveEnv(): Record<string, string> {
	const tracked = new Map<string, string>();
	const targetObj = {} as Record<string, string>;

	const canonical = (property: string) => property.toLowerCase();
	const assertProperty: (property: unknown) => asserts property is string = (
		property
	) =>
		assert(
			typeof property === "string",
			`Environment variable keys must be strings. Received: ${String(property)}`
		);

	return new Proxy(targetObj, {
		get(target, property, receiver) {
			assertProperty(property);
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.get(target, actualProperty, receiver)
				: undefined;
		},
		set(target, property, value, receiver) {
			assertProperty(property);
			const actualProperty = tracked.get(canonical(property));
			tracked.set(canonical(property), property);
			return actualProperty !== undefined
				? Reflect.set(target, actualProperty, value, receiver)
				: false;
		},
		has(target, property) {
			assertProperty(property);
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.has(target, actualProperty)
				: false;
		},
		getOwnPropertyDescriptor(target, property) {
			assertProperty(property);
			const actualProperty = tracked.get(canonical(property));
			return actualProperty !== undefined
				? Reflect.getOwnPropertyDescriptor(target, actualProperty)
				: undefined;
		},
		defineProperty(target, property, descriptor) {
			assertProperty(property);
			tracked.set(canonical(property), property);
			return Reflect.defineProperty(target, property, descriptor);
		},
		deleteProperty(target, property) {
			assertProperty(property);
			tracked.delete(canonical(property));
			return Reflect.deleteProperty(target, property);
		},
	});
}
