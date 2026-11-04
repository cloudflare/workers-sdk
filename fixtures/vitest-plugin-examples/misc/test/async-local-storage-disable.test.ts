import { AsyncLocalStorage } from "node:async_hooks";
import { it } from "vitest";

// Vitest 5.1+ calls `AsyncLocalStorage#disable()` once `vi.mock()` factories
// settle, but workerd throws "asyncLocalStorage.disable() is not implemented".
it("can disable an AsyncLocalStorage", ({ expect }) => {
	const storage = new AsyncLocalStorage<string>();
	expect(storage.run("value", () => storage.getStore())).toBe("value");

	expect(() => storage.disable()).not.toThrow();
	expect(storage.getStore()).toBeUndefined();
});
