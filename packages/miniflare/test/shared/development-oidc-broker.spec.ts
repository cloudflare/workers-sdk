import { DevelopmentOidcBrokers, DevelopmentOidcRequestPool } from "miniflare";
import { describe, it, vi } from "vitest";

const token = "e30.e30.c2ln";
describe("development OIDC capability lifecycle", () => {
	it("isolates instances and workers, revokes removed capabilities, and creates lazily", async ({
		expect,
	}) => {
		const manager = new DevelopmentOidcBrokers(),
			other = new DevelopmentOidcBrokers();
		const create = vi.fn(() => ({
			getToken: async () => token,
			dispose: vi.fn(),
		}));
		manager.update([
			{ key: "one", create },
			{ key: "two", create },
		]);
		expect(create).not.toHaveBeenCalled();
		const first = manager.capability(0) ?? "",
			second = manager.capability(1) ?? "";
		expect(first).toHaveLength(64);
		expect(first).not.toBe(second);
		expect(other.isAuthorized(first)).toBe(false);
		expect(manager.isAuthorized("é".repeat(64))).toBe(false);
		expect(await manager.getToken(first, {})).toBe(token);
		expect(create).toHaveBeenCalledOnce();
		manager.update([{ key: "new", create }]);
		expect(manager.isAuthorized(first)).toBe(false);
		expect(manager.isAuthorized(second)).toBe(false);
		await expect(manager.getToken(first, {})).rejects.toThrow("unavailable");
		manager.dispose();
	});
	it("cancels pending getters on shutdown and observes late failures", async ({
		expect,
	}) => {
		const manager = new DevelopmentOidcBrokers();
		let reject: ((error: Error) => void) | undefined;
		const dispose = vi.fn();
		manager.update([
			{
				key: "one",
				create: () => ({
					getToken: () =>
						new Promise((_, fail) => {
							reject = fail;
						}),
					dispose,
				}),
			},
		]);
		const pending = manager.getToken(manager.capability(0) ?? "", {});
		await Promise.resolve();
		manager.dispose();
		await expect(pending).rejects.toThrow("configuration changed");
		reject?.(new Error("late"));
		expect(dispose).toHaveBeenCalledOnce();
	});
	it("rejects a resolved operation if its authority changes before the caller resumes", async ({
		expect,
	}) => {
		const manager = new DevelopmentOidcBrokers();
		manager.update([
			{
				key: "one",
				create: () => ({ getToken: async () => token, dispose() {} }),
			},
		]);
		// Simulate the operation settling before the awaiting caller resumes.
		const operation = vi
			.spyOn(DevelopmentOidcRequestPool.prototype, "run")
			.mockResolvedValueOnce(token);
		try {
			const pending = manager.getToken(manager.capability(0) ?? "", {});
			manager.update([]);
			await expect(pending).rejects.toThrow("configuration changed");
		} finally {
			operation.mockRestore();
			manager.dispose();
		}
	});
	it.for(["invalid", "x".repeat(65537), "a.b.c\n"])(
		"rejects malformed or oversized broker tokens",
		async (value, { expect }) => {
			const manager = new DevelopmentOidcBrokers();
			manager.update([
				{
					key: "one",
					create: () => ({ getToken: async () => value, dispose() {} }),
				},
			]);
			await expect(
				manager.getToken(manager.capability(0) ?? "", {})
			).rejects.toThrow("invalid token");
			manager.dispose();
		}
	);
});
