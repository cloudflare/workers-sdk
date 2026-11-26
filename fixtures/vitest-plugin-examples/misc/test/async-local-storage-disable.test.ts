import { AsyncLocalStorage } from "node:async_hooks";
import { it } from "vitest";

// Vitest 5.1+ calls `AsyncLocalStorage#disable()` once `vi.mock()` factories
// settle, but workerd throws "asyncLocalStorage.disable() is not implemented".
it("can disable an AsyncLocalStorage with no active store", ({ expect }) => {
	const storage = new AsyncLocalStorage<string>();
	expect(storage.run("value", () => storage.getStore())).toBe("value");

	expect(() => storage.disable()).not.toThrow();
	expect(storage.getStore()).toBeUndefined();
});

it("can disable an AsyncLocalStorage after a run() promise settles", async ({
	expect,
}) => {
	// Mirrors how Vitest's mocker disables its factory storage
	const storage = new AsyncLocalStorage<string[]>();
	await expect(
		storage
			.run(["mock"], async () => storage.getStore())
			.finally(() => storage.disable())
	).resolves.toEqual(["mock"]);
});

it("does not silently ignore disable() inside an active run()", ({
	expect,
}) => {
	const storage = new AsyncLocalStorage<string>();
	const store = (() => {
		try {
			return storage.run("request-A", () => {
				storage.disable();
				return storage.getStore();
			});
		} catch {
			// workerd doesn't implement `disable()`, which is also acceptable
			return undefined;
		}
	})();

	expect(store).toBeUndefined();
});
