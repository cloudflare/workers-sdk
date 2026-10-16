const IGNORED_KEYS = ["self"];

type Constructor = {
	readonly prototype: object;
} & (abstract new (...args: never[]) => object);

/**
 * Create a class extending `superClass` with a lazily installed `Proxy` as its
 * `prototype`. Unknown prototype accesses defer to `getUnknownPrototypeKey()`.
 */
export function createProxyPrototypeClass<
	T extends Constructor,
	ExtraPrototype = unknown,
>(
	superClass: T,
	getUnknownPrototypeKey: (key: string) => unknown
): T & { prototype: ExtraPrototype } {
	let proxyInstalled = false;

	function Class(...args: ConstructorParameters<T>) {
		// Delay proxying the prototype until construction, so workerd sees this as a
		// regular class when introspecting it. Install it only once: the prototype is
		// shared by every instance, so wrapping it again would stack proxy traps.
		// https://github.com/cloudflare/workerd/blob/9e915ed637d65adb3c57522607d2cd8b8d692b6b/src/workerd/io/worker.c%2B%2B#L1920-L1921
		if (!proxyInstalled) {
			Class.prototype = new Proxy(Class.prototype, {
				get(target, key, receiver) {
					const value = Reflect.get(target, key, receiver);
					if (value !== undefined) {
						return value;
					}
					if (typeof key === "symbol" || IGNORED_KEYS.includes(key)) {
						return;
					}
					return getUnknownPrototypeKey.call(receiver, key as string);
				},
			});
			proxyInstalled = true;
		}

		return Reflect.construct(superClass, args, Class);
	}

	Reflect.setPrototypeOf(Class.prototype, superClass.prototype);
	Reflect.setPrototypeOf(Class, superClass);

	return Class as unknown as T & { prototype: ExtraPrototype };
}
