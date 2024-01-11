// import { fetch as undiciFetch } from "undici";
import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
});

const thing = {
	getThing() {
		return "thing";
	},
};

// https://github.com/vitest-dev/vitest/pull/4862 effectively prevents
// `vi.mock()` being called multiple times with the same package name in the
// same global scope. We re-use global scopes to avoid the performance penalty
// of initialising Vitest in `workerd` on each run.
// TODO(soon): figure out a way to allow this
// vi.mock("undici", () => {
// 	const fetch = async () => {
// 		return new Response("undici-ish");
// 	};
// 	return { fetch };
// });

describe("mocking", () => {
	it("mocks implementation", () => {
		const spy = vi.spyOn(thing, "getThing");
		expect(spy.getMockName()).toEqual("getThing");
		expect(thing.getThing()).toEqual("thing");
		expect(spy).toHaveBeenCalledOnce();

		spy.mockImplementationOnce(() => "another thing");
		expect(thing.getThing()).toEqual("another thing");
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it("mocks global fetch", async () => {
		const originalFetch = fetch;
		const spy = vi.spyOn(globalThis, "fetch");
		spy.mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			const url = new URL(request.url);
			if (request.method === "GET" && url.pathname === "/") {
				return new Response("example");
			}
			return originalFetch(request);
		});

		const response = await fetch("https://example.com/");
		expect(await response.text()).toBe("example");
	});

	// it("mocks undici fetch", async () => {
	// 	const undiciResponse = await undiciFetch("https://example.com/");
	// 	expect(await undiciResponse.text()).toBe("undici-ish");
	// });
});
