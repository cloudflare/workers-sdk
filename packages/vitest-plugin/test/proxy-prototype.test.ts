import { describe, it, vi } from "vitest";
import { createProxyPrototypeClass } from "../src/worker/proxy-prototype";

class Base {
	constructor(readonly name: string) {}

	greeting() {
		return `hello ${this.name}`;
	}
}

describe("createProxyPrototypeClass", () => {
	it("installs one proxy on first construction and reuses it", ({ expect }) => {
		const resolveUnknown = vi.fn(function (this: Base, key: string) {
			return `${this.name}:${key}`;
		});
		const Wrapped = createProxyPrototypeClass(Base, resolveUnknown);
		const prototypeBeforeConstruction = Wrapped.prototype;

		const first = new Wrapped("first");
		const installedPrototype = Wrapped.prototype;
		expect(installedPrototype).not.toBe(prototypeBeforeConstruction);
		expect(Object.getPrototypeOf(first)).toBe(installedPrototype);

		const second = new Wrapped("second");
		expect(Wrapped.prototype).toBe(installedPrototype);
		expect(Object.getPrototypeOf(second)).toBe(installedPrototype);
	});

	it("preserves prototype and unknown RPC property lookup behavior", ({
		expect,
	}) => {
		const resolveUnknown = vi.fn(function (this: Base, key: string) {
			return `${this.name}:${key}`;
		});
		const Wrapped = createProxyPrototypeClass(Base, resolveUnknown);
		const instance = new Wrapped("receiver");

		expect(instance.greeting()).toBe("hello receiver");
		expect(Reflect.get(instance, "unknownProperty")).toBe(
			"receiver:unknownProperty"
		);
		expect(resolveUnknown).toHaveBeenCalledOnce();
		expect(resolveUnknown).toHaveBeenCalledWith("unknownProperty");

		expect(Reflect.get(instance, "self")).toBeUndefined();
		expect(Reflect.get(instance, Symbol("unknown"))).toBeUndefined();
		expect(resolveUnknown).toHaveBeenCalledOnce();
	});
});
