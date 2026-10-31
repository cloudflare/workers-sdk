import assert from "node:assert/strict";
import { DevelopmentOidcBrokers } from "miniflare";
import { describe, it, vi } from "vitest";
const call = { binding: "IDENTITY", operation: "token" as const };
describe("development OIDC broker capabilities", () => {
	it("isolates workers and instances, creates lazily, invalidates changed configurations", async ({
		expect,
	}) => {
		const manager = new DevelopmentOidcBrokers(),
			other = new DevelopmentOidcBrokers();
		const dispose = vi.fn(),
			invoke = vi.fn(async () => new Response("token"));
		const create = vi.fn(() => ({ invoke, dispose }));
		manager.update([
			{ key: "one", create },
			{ key: "two", create },
		]);
		expect(create).not.toHaveBeenCalled();
		const first = manager.capability(0),
			second = manager.capability(1);
		assert(first && second);
		expect(first).toHaveLength(64);
		expect(first).not.toBe(second);
		expect(other.isAuthorized(first)).toBe(false);
		expect(manager.isAuthorized("é".repeat(64))).toBe(false);
		expect(await (await manager.invoke(first, call)).text()).toBe("token");
		expect(create).toHaveBeenCalledOnce();
		manager.update([{ key: "new", create }]);
		expect(manager.isAuthorized(first)).toBe(false);
		expect(manager.isAuthorized(second)).toBe(false);
		await expect(manager.invoke(first, call)).rejects.toThrow();
		expect(dispose).toHaveBeenCalledOnce();
		manager.dispose();
		other.dispose();
	});
	it("aborts pending operations on disposal and observes late failures", async ({
		expect,
	}) => {
		const manager = new DevelopmentOidcBrokers();
		let fail!: (error: Error) => void;
		manager.update([
			{
				key: "one",
				create: () => ({
					invoke: () =>
						new Promise<Response>((_, reject) => {
							fail = reject;
						}),
					dispose() {},
				}),
			},
		]);
		const capability = manager.capability(0);
		assert(capability);
		const pending = manager.invoke(capability, call);
		const rejected = expect(pending).rejects.toThrow("configuration changed");
		await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
		manager.dispose();
		await rejected;
		fail(new Error("late"));
	});
	it.for([
		{ ...call, audience: "other" },
		{ ...call, operation: "signRequest" },
		{ ...call, binding: "../other" },
	])(
		"rejects unknown operations and authority options",
		async (options, { expect }) => {
			const manager = new DevelopmentOidcBrokers();
			const create = vi.fn(() => ({
				invoke: async () => new Response("token"),
				dispose() {},
			}));
			manager.update([{ key: "one", create }]);
			const capability = manager.capability(0);
			assert(capability);
			await expect(
				manager.invoke(capability, options as never)
			).rejects.toThrow();
			expect(create).not.toHaveBeenCalled();
			manager.dispose();
		}
	);
});
