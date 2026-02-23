import { describe, it, vi } from "vitest";

/**
 * Tests for the AI RPC method wrapping logic in ProxyServerWorker.
 *
 * The raw AI binding (deployed with raw:true) has a workerd-internal prototype
 * that capnweb classifies as "unsupported", causing
 * "RPC stub points at a non-serializable type".
 *
 * The fix uses MF-Binding-Type (threaded from the miniflare AI plugin through
 * the remote-proxy-client WebSocket URL) to identify AI bindings, then wraps
 * them in a plain object delegating only the allowed RPC methods.
 */

// Mirrors the constant from ProxyServerWorker.ts
const AI_RPC_METHODS = ["aiSearch"] as const;

/**
 * Re-implementation of the AI wrapping logic from
 * ProxyServerWorker.ts getExposedJSRPCBinding() so we can unit-test it
 * without pulling in cloudflare:email / capnweb.
 */
function wrapIfAiBinding(
	bindingType: string | null,
	targetBinding: object
): unknown {
	if (bindingType === "ai") {
		const wrapper: Record<string, (...args: unknown[]) => unknown> = {};
		for (const method of AI_RPC_METHODS) {
			if (
				typeof (targetBinding as Record<string, unknown>)[method] === "function"
			) {
				wrapper[method] = (...args: unknown[]) =>
					(targetBinding as Record<string, (...a: unknown[]) => unknown>)[
						method
					](...args);
			}
		}
		if (Object.keys(wrapper).length > 0) {
			return wrapper;
		}
	}
	return targetBinding;
}

describe("ProxyServerWorker AI RPC wrapping", () => {
	it("wraps an AI binding into a plain object", ({ expect }) => {
		const binding = { aiSearch: vi.fn(), fetch: vi.fn() };

		const wrapped = wrapIfAiBinding("ai", binding);

		expect(Object.getPrototypeOf(wrapped)).toBe(Object.prototype);
		expect(wrapped).not.toBe(binding);
	});

	it("delegates aiSearch calls to the underlying binding", async ({
		expect,
	}) => {
		const mockAiSearch = vi.fn().mockResolvedValue({ result: "ok" });
		const binding = { aiSearch: mockAiSearch };

		const wrapped = wrapIfAiBinding("ai", binding) as Record<
			string,
			(...args: unknown[]) => unknown
		>;

		const params = { query: "test" };
		const result = await wrapped.aiSearch(params);

		expect(mockAiSearch).toHaveBeenCalledWith(params);
		expect(result).toEqual({ result: "ok" });
	});

	it("forwards all arguments to the underlying aiSearch method", ({
		expect,
	}) => {
		const mockAiSearch = vi.fn();
		const binding = { aiSearch: mockAiSearch };
		const wrapped = wrapIfAiBinding("ai", binding) as Record<
			string,
			(...args: unknown[]) => unknown
		>;

		wrapped.aiSearch("arg1", "arg2", { nested: true });

		expect(mockAiSearch).toHaveBeenCalledWith("arg1", "arg2", {
			nested: true,
		});
	});

	it("does not wrap bindings without the ai binding type", ({ expect }) => {
		const binding = { aiSearch: vi.fn(), otherMethod: vi.fn() };

		const result = wrapIfAiBinding(null, binding);

		expect(result).toBe(binding);
	});

	it("does not wrap a service binding even if it has aiSearch", ({
		expect,
	}) => {
		const binding = { aiSearch: vi.fn(), otherMethod: vi.fn() };

		const result = wrapIfAiBinding("service", binding);

		expect(result).toBe(binding);
	});

	it("does not expose non-allowlisted methods from the raw binding", ({
		expect,
	}) => {
		const binding = {
			aiSearch: vi.fn(),
			fetch: vi.fn(),
			someInternalMethod: vi.fn(),
		};

		const wrapped = wrapIfAiBinding("ai", binding) as Record<string, unknown>;

		expect(wrapped).toHaveProperty("aiSearch");
		expect(wrapped).not.toHaveProperty("fetch");
		expect(wrapped).not.toHaveProperty("someInternalMethod");
	});

	it("propagates errors thrown by the underlying aiSearch method", async ({
		expect,
	}) => {
		const binding = {
			aiSearch: vi.fn().mockRejectedValue(new Error("AI Search failed")),
		};

		const wrapped = wrapIfAiBinding("ai", binding) as Record<
			string,
			(...args: unknown[]) => Promise<unknown>
		>;

		await expect(wrapped.aiSearch({})).rejects.toThrow("AI Search failed");
	});

	it("propagates RpcTarget-like return values for multi-level RPC", async ({
		expect,
	}) => {
		class MockAccountService {
			async list() {
				return [{ id: "instance-1" }];
			}
			get(name: string) {
				return new MockInstanceService(name);
			}
		}
		class MockInstanceService {
			constructor(public instanceId: string) {}
			async search(params: { query: string }) {
				return { chunks: [], search_query: params.query };
			}
		}

		const binding = {
			aiSearch: vi.fn().mockReturnValue(new MockAccountService()),
		};

		const wrapped = wrapIfAiBinding("ai", binding) as Record<
			string,
			(...args: unknown[]) => unknown
		>;

		const svc = wrapped.aiSearch() as MockAccountService;
		expect(await svc.list()).toEqual([{ id: "instance-1" }]);

		const inst = svc.get("my-instance");
		expect(await inst.search({ query: "test" })).toEqual({
			chunks: [],
			search_query: "test",
		});
	});

	it("returns binding as-is when type is ai but no RPC methods exist", ({
		expect,
	}) => {
		const binding = { fetch: vi.fn() };

		const result = wrapIfAiBinding("ai", binding);

		expect(result).toBe(binding);
	});
});
